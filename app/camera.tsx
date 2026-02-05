import { StyleSheet, View, Text, Pressable, Modal, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { VideoFile, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';

import { useColorScheme } from '@/components/useColorScheme';
import { useToast } from '@/src/context';
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

const MIN_LOADING_TIME_MS = 1500;

type CameraState = 'connecting' | 'previewing' | 'armed' | 'recording' | 'reviewing';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { show: showToast } = useToast();

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

  const styles = createStyles(isDark);

  const showVisionCamera = visionDevice && hasCameraPermission;
  const currentError = visionCameraError || recordingError || streamError;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Connection Status - top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarContent}>
          <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} compact />
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
              <Text style={styles.streamingFpsText}>Live</Text>
            </View>
          )}
        </View>
      </View>

      {/* Video Preview - full width, always VisionCamera */}
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

      {/* Bottom bar - varies by state */}
      <View style={styles.bottomBar}>
        {cameraState === 'connecting' && (
          <>
            {/* QR Code Button */}
            <QRCodeButton
              roomCode={roomCode ? formatRoomCode(roomCode) : null}
              onPress={handleQRButtonPress}
              isPulsing={isPulsing}
              isLoading={isButtonLoading}
              isDark={isDark}
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
                isDark={isDark}
              />
            )}

            {/* Connected - streaming badge */}
            {isConnected && (
              <View style={styles.connectedSection}>
                <View style={[styles.connectedBadge, isDark && styles.connectedBadgeDark]}>
                  <Ionicons name="videocam" size={18} color="#4CAF50" />
                  <Text style={styles.connectedText}>Streaming to viewer</Text>
                </View>
              </View>
            )}

            {/* Arm recording button */}
            <Pressable
              style={[styles.armButton, isDark && styles.armButtonDark]}
              onPress={armRecording}
              accessibilityRole="button"
              accessibilityLabel="Arm Recording"
              accessibilityHint="Enter recording mode. Preview continues while recording"
            >
              <View style={styles.armButtonIcon}>
                <Ionicons name="radio-button-on" size={20} color="#ff453a" />
              </View>
              <Text style={[styles.armButtonText, isDark && styles.armButtonTextDark]}>
                Arm Recording
              </Text>
              <Text style={[styles.armButtonSubtext, isDark && styles.armButtonSubtextDark]}>
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
              style={[styles.disarmButton, isDark && styles.disarmButtonDark]}
              onPress={disarmRecording}
              accessibilityRole="button"
              accessibilityLabel="Disarm"
              accessibilityHint="Exit recording mode and return to preview"
            >
              <Ionicons name="arrow-back" size={20} color={isDark ? '#fff' : '#1a1a2e'} />
              <Text style={[styles.disarmButtonText, isDark && styles.disarmButtonTextDark]}>
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
              style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
              onPress={handleRecordAgain}
              accessibilityRole="button"
              accessibilityLabel="Record Again"
              accessibilityHint="Start a new recording"
            >
              <Ionicons name="videocam" size={20} color={isDark ? '#fff' : '#1a1a2e'} />
              <Text style={[styles.secondaryButtonText, isDark && styles.secondaryButtonTextDark]}>
                Record Again
              </Text>
            </Pressable>

            {/* Disarm */}
            <Pressable
              style={[styles.disarmButton, isDark && styles.disarmButtonDark]}
              onPress={disarmRecording}
              accessibilityRole="button"
              accessibilityLabel="Disarm"
              accessibilityHint="Exit recording mode and return to preview"
            >
              <Ionicons name="arrow-back" size={20} color={isDark ? '#fff' : '#1a1a2e'} />
              <Text style={[styles.disarmButtonText, isDark && styles.disarmButtonTextDark]}>
                Disarm
              </Text>
            </Pressable>
          </>
        )}
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
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            {/* QR Code */}
            {qrPayload && (
              <QRCodeDisplay
                value={qrPayload}
                roomCode={formatRoomCode(roomCode!)}
                size={180}
                isDark={isDark}
              />
            )}

            {/* Performance Tip */}
            <View style={[styles.tipSection, isDark && styles.tipSectionDark]}>
              <View style={styles.tipHeader}>
                <Ionicons name="flash" size={18} color="#FF9800" />
                <Text style={[styles.tipTitle, isDark && styles.tipTitleDark]}>
                  Best Performance Tip
                </Text>
              </View>
              <Text style={[styles.tipText, isDark && styles.tipTextDark]}>
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

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
    },
    topBar: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
    },
    topBarContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    streamingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(76, 175, 80, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    streamingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#4CAF50',
    },
    streamingFpsText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#4CAF50',
    },
    videoContainer: {
      flex: 1,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 16,
      overflow: 'hidden',
    },
    cameraPlaceholder: {
      flex: 1,
      backgroundColor: isDark ? '#0a0a1e' : '#e0e0e0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      color: '#888',
      fontSize: 16,
    },
    errorOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(244, 67, 54, 0.9)',
      padding: 12,
    },
    errorText: {
      color: '#fff',
      textAlign: 'center',
      fontSize: 14,
    },
    recordingOverlay: {
      position: 'absolute',
      top: 16,
      left: 16,
    },
    bottomBar: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 12,
    },
    connectedSection: {
      marginBottom: 8,
    },
    connectedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#e8f5e9',
      borderRadius: 8,
      paddingVertical: 10,
    },
    connectedBadgeDark: {
      backgroundColor: '#1a3a1a',
    },
    connectedText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#4CAF50',
    },
    armButton: {
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    armButtonDark: {
      backgroundColor: '#2a2a4e',
      borderColor: '#3a3a5e',
    },
    armButtonIcon: {
      marginBottom: 8,
    },
    armButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1a1a2e',
      marginBottom: 4,
    },
    armButtonTextDark: {
      color: '#fff',
    },
    armButtonSubtext: {
      fontSize: 13,
      color: '#666',
    },
    armButtonSubtextDark: {
      color: '#999',
    },
    recordingControls: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    syncButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 8,
      paddingVertical: 12,
    },
    syncButtonReady: {
      backgroundColor: '#2196F3',
    },
    syncButtonDisabled: {
      backgroundColor: isDark ? '#2a2a4e' : '#e0e0e0',
    },
    syncButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
    syncButtonTextDisabled: {
      color: '#888',
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#f0f0f0',
      borderRadius: 8,
      paddingVertical: 12,
    },
    secondaryButtonDark: {
      backgroundColor: '#2a2a4e',
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#1a1a2e',
    },
    secondaryButtonTextDark: {
      color: '#fff',
    },
    disarmButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#f0f0f0',
      borderRadius: 8,
      paddingVertical: 12,
    },
    disarmButtonDark: {
      backgroundColor: '#2a2a4e',
    },
    disarmButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#1a1a2e',
    },
    disarmButtonTextDark: {
      color: '#fff',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: '#ffffff',
      borderRadius: 20,
      padding: 20,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
    },
    modalContentDark: {
      backgroundColor: '#2a2a4e',
    },
    tipSection: {
      width: '100%',
      backgroundColor: '#FFF8E1',
      borderRadius: 12,
      padding: 12,
      marginTop: 16,
    },
    tipSectionDark: {
      backgroundColor: '#3a2a1a',
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    tipTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#F57C00',
    },
    tipTitleDark: {
      color: '#FFB74D',
    },
    tipText: {
      fontSize: 13,
      color: '#795548',
      lineHeight: 18,
    },
    tipTextDark: {
      color: '#BCAAA4',
    },
    closeButton: {
      marginTop: 16,
      backgroundColor: '#4CAF50',
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 8,
    },
    closeButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
