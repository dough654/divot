import { View, Text, Pressable, Modal, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { VideoFile, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';

import { useTheme, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useAdaptiveBitrate, getPresetLabel, useOrientation } from '@/src/hooks';
import type { Theme } from '@/src/context';
import { QRCodeDisplay, QRCodeButton } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import {
  RecordingButton,
  RecordingIndicator,
  VisionCameraRecorder,
  VisionCameraRecorderRef,
} from '@/src/components/recording';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useVisionCamera } from '@/src/hooks/use-vision-camera';
import { useClipSync } from '@/src/hooks/use-clip-sync';
import { useVisionCameraStream } from '@/src/hooks/use-vision-camera-stream';
import { useAutoReconnect } from '@/src/hooks/use-auto-reconnect';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { saveClip } from '@/src/services/recording/clip-storage';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep } from '@/src/types';
import type { Clip } from '@/src/types/recording';

const MIN_LOADING_TIME_MS = 800;

type CameraState = 'connecting' | 'previewing' | 'armed' | 'recording' | 'reviewing';

export default function CameraScreen() {
  const { theme } = useTheme();
  const { show: showToast } = useToast();
  const styles = useThemedStyles(createStyles);
  const { isLandscape } = useOrientation();

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isPulsing, setIsPulsing] = useState(true);
  const [isButtonLoading, setIsButtonLoading] = useState(true);
  const loadingStartTime = useState(() => Date.now())[0];

  // Camera state machine
  const [cameraState, setCameraState] = useState<CameraState>('connecting');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [lastRecordedClip, setLastRecordedClip] = useState<Clip | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const recorderRef = useRef<VisionCameraRecorderRef>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingDurationRef = useRef(0);

  // VisionCamera is always active
  const {
    device: visionDevice,
    hasCameraPermission,
    hasMicrophonePermission,
    isRequestingPermissions,
    error: visionCameraError,
    toggleCamera,
    isFrontCamera,
  } = useVisionCamera({ autoRequestPermissions: true });

  // Track if we've shown the microphone warning
  const [hasShownMicWarning, setHasShownMicWarning] = useState(false);

  // Prompt user to grant microphone permission if denied (after permission request completes)
  useEffect(() => {
    // Wait until permission request is complete before checking
    if (isRequestingPermissions) return;

    if (hasCameraPermission && !hasMicrophonePermission && !hasShownMicWarning) {
      setHasShownMicWarning(true);
      Alert.alert(
        'Microphone Access Required',
        'Microphone permission is needed for audio recording and swing detection. Without it, recordings will have no audio.',
        [
          {
            text: 'Continue Without Audio',
            style: 'cancel',
          },
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  }, [hasCameraPermission, hasMicrophonePermission, hasShownMicWarning, isRequestingPermissions]);

  const {
    connectionState: signalingConnectionState,
    roomCode,
    connect: connectSignaling,
    reconnectSignaling,
    createRoom,
    rejoinRoom,
    sendOffer,
    sendIceCandidate,
    onAnswer,
    onIceCandidate,
    onPeerJoined,
  } = useSignaling({ autoConnect: false });

  // Native WebRTC video stream from VisionCamera frame processor
  const {
    stream: visionCameraStream,
    isReady: isStreamReady,
    error: streamError,
    startStream,
    stopStream,
  } = useVisionCameraStream();

  const {
    peerConnection,
    createOffer,
    handleAnswer,
    handleIceCandidate,
    restartIce,
    renegotiate,
    isConnected,
    dataChannel,
    status: webrtcStatus,
  } = useWebRTCConnection({
    localStream: visionCameraStream,
    onIceCandidate: sendIceCandidate,
  });

  const { quality } = useConnectionQuality({
    peerConnection,
    enabled: isConnected,
  });

  // Adaptive bitrate - adjusts video quality based on network conditions
  const { currentPreset: qualityPreset } = useAdaptiveBitrate({
    peerConnection,
    quality,
    enabled: isConnected,
  });

  // Clip sync
  const {
    isReady: isSyncReady,
    progress: syncProgress,
    sendClip,
    cancelTransfer,
  } = useClipSync({
    dataChannel,
  });

  // Track whether we were ever connected (for auto-reconnect)
  const [wasConnected, setWasConnected] = useState(false);
  useEffect(() => {
    if (isConnected && !wasConnected) {
      setWasConnected(true);
    }
  }, [isConnected, wasConnected]);

  const isSyncing = syncProgress.state === 'sending' || syncProgress.state === 'receiving';

  // Frame processor plugin: forwards each VisionCamera frame to the WebRTC video source natively
  const forwardPlugin = VisionCameraProxy.initFrameProcessorPlugin('forwardToWebRTC', {});

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    forwardPlugin?.call(frame);
  }, [forwardPlugin]);

  // Auto-reconnect
  const { reconnectionState } = useAutoReconnect({
    role: 'camera',
    iceConnectionState: webrtcStatus.iceConnectionState,
    signalingConnectionState,
    wasConnected,
    roomCode,
    isRecording: cameraState === 'recording',
    isTransferring: isSyncing,
    restartIce,
    renegotiate,
    sendOffer: (sdp) => sendOffer(sdp),
    reconnectSignaling,
    rejoinRoom,
  });

  // QR code payload - keep minimal to ensure scannable at low resolution
  const qrPayload = roomCode
    ? encodeQRPayload({
        sessionId: roomCode,
        mode: 'auto',
      })
    : null;

  const isRecording = cameraState === 'recording';

  // Duration timer for recording
  useEffect(() => {
    if (isRecording) {
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
      recordingDurationRef.current = 0;

      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingDuration(elapsed);
          recordingDurationRef.current = elapsed;
        }
      }, 100);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Handle minimum loading time for smooth transition
  useEffect(() => {
    if (roomCode) {
      const elapsed = Date.now() - loadingStartTime;
      const remaining = Math.max(0, MIN_LOADING_TIME_MS - elapsed);

      const timer = setTimeout(() => {
        setIsButtonLoading(false);
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [roomCode, loadingStartTime]);

  // Start camera, native WebRTC stream, and connection on mount
  useEffect(() => {
    const initialize = async () => {
      // Create the native WebRTC video track before signaling
      await startStream();

      setConnectionStep('generating-session');
      await connectSignaling();
      const code = await createRoom();
      if (code) {
        setConnectionStep('displaying-qr');
        setCameraState('previewing');
      }
    };
    initialize();

    return () => {
      stopStream();
    };
  }, []);

  // Handle peer joined - create and send offer
  useEffect(() => {
    const unsubscribe = onPeerJoined(async () => {
      setShowQRModal(false);
      setConnectionStep('establishing-webrtc');
      const offer = await createOffer();
      if (offer) {
        sendOffer(offer.sdp);
      }
    });
    return unsubscribe;
  }, [onPeerJoined, createOffer, sendOffer]);

  // Handle answer from viewer
  useEffect(() => {
    const unsubscribe = onAnswer(async (sdp) => {
      await handleAnswer({ type: 'answer', sdp });
    });
    return unsubscribe;
  }, [onAnswer, handleAnswer]);

  // Handle ICE candidates from viewer
  useEffect(() => {
    const unsubscribe = onIceCandidate(async (candidate) => {
      await handleIceCandidate(candidate);
    });
    return unsubscribe;
  }, [onIceCandidate, handleIceCandidate]);

  // Update connection step based on WebRTC and reconnection state
  useEffect(() => {
    if (isConnected) {
      setConnectionStep('connected');
    } else if (reconnectionState.isReconnecting) {
      setConnectionStep('reconnecting');
    } else if (reconnectionState.lastDisconnectReason && !reconnectionState.isReconnecting && reconnectionState.attempt > 0) {
      setConnectionStep('reconnect-failed');
    }
  }, [isConnected, reconnectionState]);

  const handleQRButtonPress = () => {
    setShowQRModal(true);
    if (isPulsing) {
      setIsPulsing(false);
    }
  };

  // Arm recording (no camera switch needed)
  const armRecording = useCallback(() => {
    setRecordingError(null);
    setLastRecordedClip(null);
    setCameraState('armed');
  }, []);

  // Disarm recording
  const disarmRecording = useCallback(() => {
    setCameraState('previewing');
  }, []);

  // Start recording
  const handleStartRecording = useCallback(() => {
    if (!recorderRef.current) {
      setRecordingError('Camera not ready');
      return;
    }

    setRecordingError(null);
    setCameraState('recording');

    recorderRef.current.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        const duration = recordingDurationRef.current;

        try {
          const clip = await saveClip({
            path: video.path,
            duration,
            fps: 30,
          });

          setLastRecordedClip(clip);
          setCameraState('reviewing');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to save recording';
          setRecordingError(errorMsg);
          setCameraState('armed');
          showToast(`Save Failed: ${errorMsg}`, { variant: 'error' });
        }
      },
      onRecordingError: (error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : 'Recording failed';
        setRecordingError(errorMsg);
        setCameraState('armed');
        showToast(`Recording Error: ${errorMsg}`, { variant: 'error' });
      },
    });
  }, []);

  // Stop recording
  const handleStopRecording = useCallback(async () => {
    if (!recorderRef.current) return;

    try {
      await recorderRef.current.stopRecording();
    } catch (err) {
      console.error('Error stopping recording:', err);
    }
  }, []);

  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  }, [isRecording, handleStopRecording, handleStartRecording]);

  // Sync last recorded clip to viewer
  const handleSyncClip = useCallback(async () => {
    if (!lastRecordedClip) {
      showToast('Record a clip first', { variant: 'warning' });
      return;
    }
    if (!isSyncReady) {
      showToast('Connect to a viewer device first', { variant: 'warning' });
      return;
    }

    setShowSyncModal(true);
    try {
      await sendClip(lastRecordedClip);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed';
      showToast(`Sync Failed: ${errorMsg}`, { variant: 'error' });
    }
  }, [lastRecordedClip, isSyncReady, sendClip]);

  const handleSyncDismiss = useCallback(() => {
    setShowSyncModal(false);
    if (syncProgress.state === 'complete') {
      setLastRecordedClip(null);
      setCameraState('previewing');
    }
  }, [syncProgress.state]);

  // Record again from reviewing state
  const handleRecordAgain = useCallback(() => {
    setLastRecordedClip(null);
    setCameraState('armed');
  }, []);

  const showVisionCamera = visionDevice && hasCameraPermission;
  const currentError = visionCameraError || recordingError || streamError;

  return (
    <SafeAreaView
      style={styles.container}
      edges={isLandscape ? ['bottom', 'left', 'right'] : ['bottom']}
    >
      <View style={isLandscape ? styles.landscapeWrapper : styles.portraitWrapper}>
        {/* Video Preview - full width in portrait, left side in landscape */}
        <View style={isLandscape ? styles.videoContainerLandscape : styles.videoContainerPortrait}>
          {/* Connection Status - overlay on video in landscape, top bar in portrait */}
          {isLandscape ? (
            <View style={styles.topBarOverlay}>
              <View style={styles.topBarContent}>
                <ConnectionStatus step={connectionStep} quality={quality} compact />
                {isRecording && (
                  <RecordingIndicator
                    duration={recordingDuration}
                    visible={isRecording}
                    compact
                  />
                )}
                {isConnected && isStreamReady && !isRecording && (
                  <View style={styles.streamingBadge}>
                    <View style={styles.streamingDot} />
                    <Text style={styles.streamingFpsText}>
                      Live · {getPresetLabel(qualityPreset)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.topBar}>
              <View style={styles.topBarContent}>
                <ConnectionStatus step={connectionStep} quality={quality} compact />
                {isRecording && (
                  <RecordingIndicator
                    duration={recordingDuration}
                    visible={isRecording}
                    compact
                  />
                )}
                {isConnected && isStreamReady && !isRecording && (
                  <View style={styles.streamingBadge}>
                    <View style={styles.streamingDot} />
                    <Text style={styles.streamingFpsText}>
                      Live · {getPresetLabel(qualityPreset)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.videoContainer}>
            {showVisionCamera ? (
              <VisionCameraRecorder
                ref={recorderRef}
                device={visionDevice}
                isActive={true}
                isFrontCamera={isFrontCamera}
                audio={hasMicrophonePermission}
                onFlipCamera={toggleCamera}
                frameProcessor={frameProcessor}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Text style={styles.placeholderText}>
                  {hasCameraPermission ? 'No camera device found' : 'Camera permission required'}
                </Text>
              </View>
            )}
            {currentError && (
              <View style={styles.errorOverlay}>
                <Text style={styles.errorText}>{currentError}</Text>
              </View>
            )}

            {/* Recording indicator overlay */}
            {isRecording && (
              <View style={styles.recordingOverlay}>
                <RecordingIndicator
                  duration={recordingDuration}
                  visible={isRecording}
                />
              </View>
            )}
          </View>
        </View>

        {/* Controls - bottom bar in portrait, right side panel in landscape */}
        <View style={isLandscape ? styles.sidePanel : styles.bottomBar}>
        {cameraState === 'connecting' && (
          <>
            {/* QR Code Button */}
            <QRCodeButton
              roomCode={roomCode ? formatRoomCode(roomCode) : null}
              onPress={handleQRButtonPress}
              isPulsing={isPulsing}
              isLoading={isButtonLoading}
            />
          </>
        )}

        {cameraState === 'previewing' && (
          <>
            {/* QR Code Button - when not connected */}
            {!isConnected && (
              <QRCodeButton
                roomCode={roomCode ? formatRoomCode(roomCode) : null}
                onPress={handleQRButtonPress}
                isPulsing={isPulsing}
                isLoading={isButtonLoading}
              />
            )}

            {/* Connected - streaming badge */}
            {isConnected && (
              <View style={styles.connectedSection}>
                <View style={styles.connectedBadge}>
                  <Ionicons name="videocam" size={18} color="#4CAF50" />
                  <Text style={styles.connectedText}>Streaming to viewer</Text>
                </View>
              </View>
            )}

            {/* Arm recording button */}
            <Pressable
              style={styles.armButton}
              onPress={armRecording}
              accessibilityRole="button"
              accessibilityLabel="Arm Recording"
              accessibilityHint="Enter recording mode. Preview continues while recording"
            >
              <View style={styles.armButtonIcon}>
                <Ionicons name="radio-button-on" size={20} color="#ff453a" />
              </View>
              <Text style={styles.armButtonText}>
                Arm Recording
              </Text>
              <Text style={styles.armButtonSubtext}>
                Preview continues while recording
              </Text>
            </Pressable>
          </>
        )}

        {cameraState === 'armed' && (
          <>
            {/* Record button */}
            <View style={styles.recordingControls}>
              <RecordingButton
                isRecording={false}
                onPress={handleRecordPress}
                disabled={!visionDevice || !hasCameraPermission}
              />
            </View>

            {/* Disarm button */}
            <Pressable
              style={styles.disarmButton}
              onPress={disarmRecording}
              accessibilityRole="button"
              accessibilityLabel="Disarm"
              accessibilityHint="Exit recording mode and return to preview"
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
              <Text style={styles.disarmButtonText}>
                Disarm
              </Text>
            </Pressable>
          </>
        )}

        {cameraState === 'recording' && (
          <>
            {/* Stop button */}
            <View style={styles.recordingControls}>
              <RecordingButton
                isRecording={true}
                onPress={handleRecordPress}
                disabled={false}
              />
            </View>
          </>
        )}

        {cameraState === 'reviewing' && (
          <>
            {/* Sync to viewer button */}
            {lastRecordedClip && (
              <Pressable
                style={[
                  styles.syncButton,
                  isSyncReady ? styles.syncButtonReady : styles.syncButtonDisabled,
                ]}
                onPress={handleSyncClip}
                disabled={!isSyncReady}
                accessibilityRole="button"
                accessibilityLabel={isSyncReady ? 'Sync to Viewer' : 'Connect viewer to sync'}
                accessibilityHint={isSyncReady ? 'Transfer the recorded clip to the viewer device' : 'A viewer must be connected to sync clips'}
                accessibilityState={{ disabled: !isSyncReady }}
              >
                <Ionicons
                  name="cloud-upload"
                  size={20}
                  color={isSyncReady ? '#fff' : '#888'}
                />
                <Text style={[
                  styles.syncButtonText,
                  !isSyncReady && styles.syncButtonTextDisabled,
                ]}>
                  {isSyncReady ? 'Sync to Viewer' : 'Connect viewer to sync'}
                </Text>
              </Pressable>
            )}

            {/* Record again */}
            <Pressable
              style={styles.secondaryButton}
              onPress={handleRecordAgain}
              accessibilityRole="button"
              accessibilityLabel="Record Again"
              accessibilityHint="Start a new recording"
            >
              <Ionicons name="videocam" size={20} color={theme.colors.text} />
              <Text style={styles.secondaryButtonText}>
                Record Again
              </Text>
            </Pressable>

            {/* Disarm */}
            <Pressable
              style={styles.disarmButton}
              onPress={disarmRecording}
              accessibilityRole="button"
              accessibilityLabel="Disarm"
              accessibilityHint="Exit recording mode and return to preview"
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
              <Text style={styles.disarmButtonText}>
                Disarm
              </Text>
            </Pressable>
          </>
        )}
        </View>
      </View>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowQRModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Close QR code modal"
          accessibilityHint="Tap outside to close"
        >
          <View style={styles.modalContent}>
            {/* QR Code */}
            {qrPayload && (
              <QRCodeDisplay
                value={qrPayload}
                roomCode={formatRoomCode(roomCode!)}
                size={180}
              />
            )}

            {/* Performance Tip */}
            <View style={styles.tipSection}>
              <View style={styles.tipHeader}>
                <Ionicons name="flash" size={18} color={theme.colors.warning} />
                <Text style={styles.tipTitle}>
                  Best Performance Tip
                </Text>
              </View>
              <Text style={styles.tipText}>
                For lowest latency: Enable this phone's hotspot, connect the viewer to it, then scan.
              </Text>
            </View>

            {/* Close button */}
            <Pressable
              style={styles.closeButton}
              onPress={() => setShowQRModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
              accessibilityHint="Close the QR code modal"
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Sync Progress Modal */}
      <TransferProgressModal
        visible={showSyncModal}
        progress={syncProgress}
        onCancel={cancelTransfer}
        onDismiss={handleSyncDismiss}
      />
    </SafeAreaView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  portraitWrapper: {
    flex: 1,
    flexDirection: 'column' as const,
  },
  landscapeWrapper: {
    flex: 1,
    flexDirection: 'row' as const,
  },
  videoContainerPortrait: {
    flex: 1,
  },
  videoContainerLandscape: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  topBarOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  topBarContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  streamingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  streamingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  streamingFpsText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.success,
  },
  videoContainer: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden' as const,
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTertiary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  placeholderText: {
    color: theme.colors.textTertiary,
    fontSize: theme.fontSize.md,
  },
  errorOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    padding: theme.spacing.md,
  },
  errorText: {
    color: theme.palette.white,
    textAlign: 'center' as const,
    fontSize: theme.fontSize.sm,
  },
  recordingOverlay: {
    position: 'absolute' as const,
    top: theme.spacing.lg,
    left: theme.spacing.lg,
  },
  bottomBar: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  sidePanel: {
    width: 240,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    justifyContent: 'center' as const,
  },
  connectedSection: {
    marginBottom: theme.spacing.sm,
  },
  connectedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.successBackground,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
  },
  connectedText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.success,
  },
  armButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  armButtonIcon: {
    marginBottom: theme.spacing.sm,
  },
  armButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  armButtonSubtext: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  recordingControls: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.lg,
  },
  syncButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
  },
  syncButtonReady: {
    backgroundColor: theme.colors.secondary,
  },
  syncButtonDisabled: {
    backgroundColor: theme.colors.surface,
  },
  syncButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.palette.white,
  },
  syncButtonTextDisabled: {
    color: theme.colors.textTertiary,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
  },
  secondaryButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
  },
  disarmButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
  },
  disarmButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing.xl,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    width: '100%' as const,
    maxWidth: 340,
    alignItems: 'center' as const,
  },
  tipSection: {
    width: '100%' as const,
    backgroundColor: theme.colors.warningBackground,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  tipHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    marginBottom: 6,
  },
  tipTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.warning,
  },
  tipText: {
    fontSize: 13,
    color: theme.isDark ? '#BCAAA4' : '#795548',
    lineHeight: 18,
  },
  closeButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing['3xl'],
    borderRadius: theme.borderRadius.sm,
  },
  closeButtonText: {
    color: theme.palette.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
}));
