import { View, Text, Pressable, Modal, Alert, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { VideoFile, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

import { useTheme, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useAdaptiveBitrate, getPresetLabel } from '@/src/hooks';
import type { Theme } from '@/src/context';
import { QRCodeDisplay, ConnectionRequestModal } from '@/src/components/pairing';
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
import { useBLEAdvertising } from '@/src/hooks/use-ble-discovery';
import { useAutoConnect } from '@/src/hooks/use-auto-connect';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { saveClip } from '@/src/services/recording/clip-storage';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep, ConnectionRequest } from '@/src/types';
import type { Clip } from '@/src/types/recording';

const MIN_LOADING_TIME_MS = 800;

type CameraState = 'connecting' | 'previewing' | 'recording' | 'reviewing';

export default function CameraScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { show: showToast } = useToast();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isButtonLoading, setIsButtonLoading] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const loadingStartTime = useState(() => Date.now())[0];

  // Pulse ring animation for QR button hint
  const hintRingScale = useSharedValue(1);
  const hintRingOpacity = useSharedValue(0);

  // Camera state machine
  const [cameraState, setCameraState] = useState<CameraState>('connecting');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [lastRecordedClip, setLastRecordedClip] = useState<Clip | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<ConnectionRequest | null>(null);

  const recorderRef = useRef<VisionCameraRecorderRef>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const p2pOfferCreatedRef = useRef(false);
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
    channel,
    connect: connectSignaling,
    reconnectSignaling,
    createRoom,
    rejoinRoom,
    onPeerJoined,
    respondToRequest,
    onConnectionRequest,
  } = useSignaling({ autoConnect: false });

  // Native WebRTC video stream from VisionCamera frame processor
  const {
    stream: visionCameraStream,
    isReady: isStreamReady,
    error: streamError,
    startStream,
    stopStream,
  } = useVisionCameraStream();

  const autoConnect = useAutoConnect({
    role: 'camera',
    roomCode,
    serverChannel: channel,
    serverReady: !!roomCode,
    enabled: !!roomCode,
  });

  const {
    peerConnection,
    createOffer,
    restartIce,
    renegotiate,
    isConnected,
    dataChannel,
    status: webrtcStatus,
  } = useWebRTCConnection({
    localStream: visionCameraStream,
    signalingChannel: autoConnect.channel,
  });

  // BLE advertising — discoverable to nearby viewers once room code is ready
  const { isAdvertising } = useBLEAdvertising({
    roomCode: roomCode ?? '',
    enabled: !!roomCode && !isConnected,
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

  // Auto-reconnect — mask signaling state when on P2P so Scenario B doesn't fire
  const effectiveSignalingState = autoConnect.activeTransport === 'p2p'
    ? 'connected' as const
    : signalingConnectionState;

  const { reconnectionState } = useAutoReconnect({
    role: 'camera',
    iceConnectionState: webrtcStatus.iceConnectionState,
    signalingConnectionState: effectiveSignalingState,
    wasConnected,
    roomCode,
    isRecording: cameraState === 'recording',
    isTransferring: isSyncing,
    restartIce,
    renegotiate,
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

  // Start pulse ring animation once room code is ready
  useEffect(() => {
    if (!showHint || isButtonLoading) return;

    hintRingScale.value = withRepeat(
      withSequence(
        withTiming(1.7, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 0 }),
        withDelay(400, withTiming(1, { duration: 0 })),
      ),
      8,
    );

    // Fade from 0.7→0 as ring expands, snap back for each cycle, then fade out
    hintRingOpacity.value = withSequence(
      withTiming(0.7, { duration: 0 }),
      withRepeat(
        withSequence(
          withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) }),
          withTiming(0.7, { duration: 0 }),
          withDelay(400, withTiming(0.7, { duration: 0 })),
        ),
        8,
      ),
      withTiming(0, { duration: 300 }),
    );
  }, [showHint, isButtonLoading]);

  const hintRingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: hintRingScale.value }],
    opacity: hintRingOpacity.value,
  }));

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

  // Handle peer joined via server — create and send offer
  useEffect(() => {
    const unsubscribe = onPeerJoined(async () => {
      setShowQRModal(false);
      setConnectionStep('establishing-webrtc');
      await createOffer();
    });
    return unsubscribe;
  }, [onPeerJoined, createOffer]);

  // P2P peer connected — create WebRTC offer over the P2P channel (once only)
  useEffect(() => {
    if (autoConnect.state === 'connected-p2p' && !p2pOfferCreatedRef.current) {
      p2pOfferCreatedRef.current = true;
      setShowQRModal(false);
      setConnectionStep('establishing-webrtc');
      createOffer();
    }
  }, [autoConnect.state, createOffer]);

  // Handle incoming connection requests (BLE tap handshake)
  useEffect(() => {
    const unsubscribe = onConnectionRequest((request) => {
      setPendingRequest(request);
    });
    return unsubscribe;
  }, [onConnectionRequest]);

  const handleAcceptConnection = useCallback(() => {
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, true);
    setPendingRequest(null);
  }, [pendingRequest, roomCode, respondToRequest]);

  const handleDeclineConnection = useCallback(() => {
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, false, 'declined');
    setPendingRequest(null);
  }, [pendingRequest, roomCode, respondToRequest]);

  const handleTimeoutConnection = useCallback(() => {
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, false, 'timeout');
    setPendingRequest(null);
  }, [pendingRequest, roomCode, respondToRequest]);

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
    setShowHint(false);
  };

  // Start recording
  const handleStartRecording = useCallback(() => {
    if (!recorderRef.current) {
      setRecordingError('Camera not ready');
      return;
    }

    setRecordingError(null);
    setLastRecordedClip(null);
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
          setCameraState('previewing');
          showToast(`Save Failed: ${errorMsg}`, { variant: 'error' });
        }
      },
      onRecordingError: (error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : 'Recording failed';
        setRecordingError(errorMsg);
        setCameraState('previewing');
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
    setRecordingError(null);
    setCameraState('previewing');
  }, []);

  const showVisionCamera = visionDevice && hasCameraPermission;
  const currentError = visionCameraError || recordingError || streamError;

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back to Home">
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          <Text style={styles.backLabel}>Home</Text>
        </Pressable>
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
        {isAdvertising && !isConnected && (
          <View style={styles.discoverableBadge}>
            <Ionicons name="bluetooth" size={12} color={theme.colors.textTertiary} />
            <Text style={styles.discoverableText}>Discoverable</Text>
          </View>
        )}
        {isConnected && autoConnect.activeTransport && (
          <View style={[
            styles.transportBadge,
            autoConnect.activeTransport === 'p2p' ? styles.transportBadgeP2P : styles.transportBadgeServer,
          ]}>
            <Ionicons
              name={autoConnect.activeTransport === 'p2p' ? 'radio' : 'cloud-outline'}
              size={11}
              color={autoConnect.activeTransport === 'p2p' ? '#7C6BFF' : theme.colors.textTertiary}
            />
            <Text style={[
              styles.transportBadgeText,
              autoConnect.activeTransport === 'p2p' && styles.transportBadgeTextP2P,
            ]}>
              {autoConnect.activeTransport === 'p2p' ? 'P2P' : 'Server'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.portraitWrapper}>
        {/* Video Preview */}
        <View style={styles.videoContainerPortrait}>

          <View style={styles.videoContainer}>
            {showVisionCamera ? (
              <VisionCameraRecorder
                ref={recorderRef}
                device={visionDevice}
                isActive={true}
                audio={hasMicrophonePermission}
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

        {/* Floating QR Button — bottom-left */}
        {(cameraState === 'connecting' || (cameraState === 'previewing' && !isConnected)) && (
          <View style={[styles.floatingQRContainer, { bottom: insets.bottom + 24 }]}>
            {/* Pulse ring — behind button */}
            {showHint && !isButtonLoading && (
              <Animated.View style={[styles.hintRing, hintRingAnimatedStyle]} />
            )}

            {/* QR button */}
            <Pressable
              style={styles.floatingQRButton}
              onPress={handleQRButtonPress}
              disabled={isButtonLoading}
              accessibilityRole="button"
              accessibilityLabel={isButtonLoading ? 'Generating room code' : 'Show QR code'}
            >
              {isButtonLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="qr-code" size={26} color="#fff" />
              )}
            </Pressable>
          </View>
        )}

        {/* Tooltip — positioned independently to avoid container width constraint */}
        {(cameraState === 'connecting' || (cameraState === 'previewing' && !isConnected)) && showHint && !isButtonLoading && (
          <View style={[styles.hintTooltip, { bottom: insets.bottom + 86 }]}>
            <Text style={styles.hintTooltipText} numberOfLines={1}>Tap to pair</Text>
            <View style={styles.hintTooltipArrow} />
          </View>
        )}

        {/* Floating Flip Camera Button — bottom-right */}
        {(cameraState === 'connecting' || cameraState === 'previewing') && (
          <Pressable
            style={[styles.floatingFlipButton, { bottom: insets.bottom + 24 }]}
            onPress={toggleCamera}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            accessibilityHint="Switch between front and back camera"
          >
            <Ionicons name="camera-reverse" size={26} color="#fff" />
          </Pressable>
        )}

        {/* Floating Record Button — bottom-center */}
        {(cameraState === 'previewing' || cameraState === 'recording') && (
          <View style={[styles.floatingRecordButton, { bottom: insets.bottom + 16 }]}>
            <RecordingButton
              isRecording={isRecording}
              onPress={handleRecordPress}
              disabled={!visionDevice || !hasCameraPermission}
              size={64}
            />
          </View>
        )}

        {/* Floating Review Controls — bottom-center row of pills */}
        {cameraState === 'reviewing' && (
          <View style={[styles.floatingReviewControls, { bottom: insets.bottom + 24 }]}>
            {lastRecordedClip && (
              <Pressable
                style={[styles.reviewPill, isSyncReady ? styles.reviewPillPrimary : styles.reviewPillDisabled]}
                onPress={handleSyncClip}
                disabled={!isSyncReady}
                accessibilityRole="button"
                accessibilityLabel={isSyncReady ? 'Sync to Viewer' : 'Connect viewer to sync'}
              >
                <Ionicons name="cloud-upload" size={16} color={isSyncReady ? '#fff' : '#888'} />
                <Text style={[styles.reviewPillText, !isSyncReady && styles.reviewPillTextDisabled]}>
                  Sync to Viewer
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.reviewPill, styles.reviewPillSecondary]}
              onPress={handleRecordAgain}
              accessibilityRole="button"
              accessibilityLabel="Record Again"
            >
              <Text style={styles.reviewPillText}>Record Again</Text>
            </Pressable>

            <Pressable
              style={[styles.reviewPill, styles.reviewPillDismiss]}
              onPress={() => { setLastRecordedClip(null); setCameraState('previewing'); }}
              accessibilityRole="button"
              accessibilityLabel="Discard recording"
            >
              <Text style={styles.reviewPillText}>Discard</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQRModal(false)}
        supportedOrientations={['portrait']}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowQRModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Close QR code modal"
          accessibilityHint="Tap outside to close"
        >
          <View style={styles.modalContent}>
            <Pressable
              style={styles.modalCloseX}
              onPress={() => setShowQRModal(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityHint="Close the QR code modal"
            >
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </Pressable>
            {qrPayload && (
              <QRCodeDisplay
                value={qrPayload}
                roomCode={formatRoomCode(roomCode!)}
                size={200}
              />
            )}
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

      {/* Connection Request Modal (BLE tap handshake) */}
      <ConnectionRequestModal
        visible={!!pendingRequest}
        deviceName={pendingRequest?.deviceName ?? ''}
        platform={pendingRequest?.platform ?? ''}
        onAccept={handleAcceptConnection}
        onDecline={handleDeclineConnection}
        onTimeout={handleTimeoutConnection}
      />
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  portraitWrapper: {
    flex: 1,
    flexDirection: 'column' as const,
  },
  videoContainerPortrait: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 4,
  },
  backLabel: {
    fontFamily: theme.fontFamily.body,
    fontSize: 17,
    color: theme.colors.text,
  },
  streamingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: theme.colors.successBackground,
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
    fontFamily: theme.fontFamily.body,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.success,
  },
  discoverableBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  discoverableText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textTertiary,
  },
  videoContainer: {
    flex: 1,
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
  floatingQRContainer: {
    position: 'absolute' as const,
    left: 20,
    zIndex: 10,
    overflow: 'visible' as const,
  },
  floatingQRButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  hintRing: {
    position: 'absolute' as const,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  hintTooltip: {
    position: 'absolute' as const,
    left: 36,
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    zIndex: 10,
  },
  hintTooltipArrow: {
    position: 'absolute' as const,
    bottom: -8,
    left: 14,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 9,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0,0,0,0.7)',
  },
  hintTooltipText: {
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.body,
    fontWeight: theme.fontWeight.medium,
  },
  floatingFlipButton: {
    position: 'absolute' as const,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 10,
  },
  floatingRecordButton: {
    position: 'absolute' as const,
    alignSelf: 'center' as const,
    zIndex: 10,
  },
  floatingReviewControls: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
    zIndex: 10,
    paddingHorizontal: theme.spacing.md,
  },
  reviewPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  reviewPillPrimary: {
    backgroundColor: theme.colors.secondary,
  },
  reviewPillSecondary: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  reviewPillDisabled: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  reviewPillDismiss: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reviewPillText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.body,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
  },
  reviewPillTextDisabled: {
    color: '#888',
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
    maxHeight: '95%' as const,
    alignItems: 'center' as const,
  },
  modalCloseX: {
    position: 'absolute' as const,
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 1,
    padding: theme.spacing.xs,
  },
  floatingTopLeft: {
    position: 'absolute' as const,
    top: 52,
    left: 14,
    zIndex: 10,
  },
  floatingTopRight: {
    position: 'absolute' as const,
    top: 52,
    right: 14,
    zIndex: 10,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },
  pillConnection: {
    backgroundColor: theme.colors.successBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,204,102,0.15)',
  },
  pillQuality: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  transportBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  transportBadgeP2P: {
    backgroundColor: 'rgba(124,107,255,0.15)',
  },
  transportBadgeServer: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  transportBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textTertiary,
  },
  transportBadgeTextP2P: {
    color: '#7C6BFF',
    fontFamily: theme.fontFamily.bodySemiBold,
  },
}));
