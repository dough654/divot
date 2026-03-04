import { View, Text, Pressable, Modal, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useFeatureFlag } from 'posthog-react-native';

import { useTheme, useToast, useSettings } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useAdaptiveBitrate, getPresetLabel, useCameraAngleDetection } from '@/src/hooks';
import type { Theme } from '@/src/context';
import { QRCodeDisplay, ConnectionRequestModal } from '@/src/components/pairing';
import { ConnectionStatus, TransportBadge } from '@/src/components/connection';
import {
  ArmButton,
  VisionCameraRecorder,
  VisionCameraRecorderRef,
  DetectionDebugOverlay,
} from '@/src/components/recording';
import { usePoseDetection } from '@/src/hooks/use-pose-detection';
import { useSwingFeedback } from '@/src/hooks/use-swing-feedback';
import { useMotionDetection } from '@/src/hooks/use-motion-detection';
import { useAudioMetering } from '@/src/hooks/use-audio-metering';
import { useMotionSwingDetection } from '@/src/hooks/use-motion-swing-detection';
import { useSwingClassifier } from '@/src/hooks/use-swing-classifier';
import { useSwingDetectionAnalytics } from '@/src/hooks/use-swing-detection-analytics';
import { usePhaseAnnouncer } from '@/src/hooks/use-phase-announcer';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useVisionCamera } from '@/src/hooks/use-vision-camera';
import { useClipSync } from '@/src/hooks/use-clip-sync';
import { useVisionCameraStream } from '@/src/hooks/use-vision-camera-stream';
import { useAutoReconnect } from '@/src/hooks/use-auto-reconnect';
import { useBLEAdvertising } from '@/src/hooks/use-ble-discovery';
import { useAutoConnect } from '@/src/hooks/use-auto-connect';
import { useConnectionAnalytics } from '@/src/hooks/use-connection-analytics';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { useSessionLifecycle } from '@/src/hooks/use-session-lifecycle';
import { useRollingRecorder } from '@/src/hooks/use-rolling-recorder';
import { useSwingRecorder } from '@/src/hooks/use-swing-recorder';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { formatRoomCode, resolveNetworkTransport } from '@/src/utils';
import { calculateSwingTempo } from '@/src/utils/swing-tempo';
import type { SwingTempo } from '@/src/utils/swing-tempo';
import type { ConnectionStep, ConnectionRequest } from '@/src/types';
import type { Clip } from '@/src/types/recording';

const MIN_LOADING_TIME_MS = 800;

type CameraState = 'connecting' | 'previewing' | 'recording' | 'reviewing';

export default function CameraScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const { settings, setCameraAngle } = useSettings();

  // PostHog feature flags gate native ML inference
  const poseDetectionFlag = useFeatureFlag('pose-detection-enabled');
  const autoDetectionFlag = useFeatureFlag('swing-auto-detection-enabled');

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

  // Pulse ring animation for arm button hint
  const [showArmHint, setShowArmHint] = useState(false);
  const armHintRingScale = useSharedValue(1);
  const armHintRingOpacity = useSharedValue(0);

  // Camera state machine
  const [cameraState, setCameraState] = useState<CameraState>('connecting');
  const [isArmed, setIsArmed] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [lastRecordedClip, setLastRecordedClip] = useState<Clip | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<ConnectionRequest | null>(null);

  const recorderRef = useRef<VisionCameraRecorderRef>(null);
  const p2pOfferCreatedRef = useRef(false);
  // VisionCamera is always active
  const {
    device: visionDevice,
    format: visionFormat,
    actualFps: recordingFps,
    hasCameraPermission,
    error: visionCameraError,
    toggleCamera,
  } = useVisionCamera({ autoRequestPermissions: true, targetFps: settings.recordingFps });

  // Pose detection — gated by feature flag + user setting
  // Also required when swing classifier is enabled (needs joint data)
  const poseDetectionEnabled = !!poseDetectionFlag && (settings.poseOverlayEnabled || settings.swingClassifierEnabled);
  const { rawPoseData } = usePoseDetection({ enabled: poseDetectionEnabled });

  // Angle state — hook call moved below classifier, but state declared here
  const [angleManualOverride, setAngleManualOverride] = useState(false);

  // Auto-detection pipeline: motion + audio → swing detection → rolling recorder
  // Decoupled from pose detection — uses frame differencing instead
  const autoDetectEnabled = isArmed && !!autoDetectionFlag && settings.swingAutoDetectionEnabled && cameraState === 'previewing';
  const { playSwingStart, playSwingEnd, playAddressReady } = useSwingFeedback({ enabled: autoDetectEnabled });

  // Motion-based swing detection state machine (legacy)
  const swingStartRef = useRef<(() => boolean | void) | null>(null);
  const swingEndRef = useRef<(() => void) | null>(null);
  const useClassifier = autoDetectEnabled && settings.swingClassifierEnabled;
  const useMotionDetect = autoDetectEnabled && !settings.swingClassifierEnabled;

  // Motion detection — only needed for the motion detection path (classifier uses pose stillness)
  const { motionMagnitude } = useMotionDetection({ enabled: useMotionDetect });

  // Audio metering — only needed for motion-based detection (classifier uses pose data).
  // Keeping this disabled when using the classifier also avoids iOS routing all audio
  // to the earpiece (allowsRecordingIOS sets playAndRecord mode).
  const { audioLevel } = useAudioMetering({ enabled: useMotionDetect });

  const motionSwingResult = useMotionSwingDetection({
    enabled: useMotionDetect,
    motionMagnitude,
    audioLevel,
    sensitivity: settings.swingDetectionSensitivity,
    onSwingStarted: useCallback(() => {
      const accepted = swingStartRef.current?.();
      if (accepted !== false) playSwingStart();
    }, [playSwingStart]),
    onSwingEnded: useCallback((audioConfirmed: boolean) => {
      playSwingEnd();
      swingEndRef.current?.();
      if (__DEV__) {
        console.log('[Camera] Swing ended, audio confirmed:', audioConfirmed);
      }
    }, [playSwingEnd]),
  });

  // Classifier-based swing detection (new)
  // Recording is handled by useSwingRecorder watching detectionState — callbacks are audio-only
  const classifierResult = useSwingClassifier({
    enabled: useClassifier,
    rawPoseData: rawPoseData ?? null,
    onSwingStarted: useCallback(() => {
      playSwingStart();
    }, [playSwingStart]),
    onSwingEnded: useCallback((durationMs: number) => {
      playSwingEnd();
      if (__DEV__) {
        console.log('[Camera] Classifier swing ended:', durationMs, 'ms');
      }
    }, [playSwingEnd]),
  });

  // Swing detection analytics — telemetry for rotation thresholds and session health
  useSwingDetectionAnalytics({
    enabled: useClassifier,
    analyticsSnapshot: classifierResult.analyticsSnapshot,
  });

  // Unified interface — pick from classifier or motion
  const isStill = useClassifier
    ? classifierResult.isInAddress || classifierResult.isSwinging
    : motionSwingResult.isStill;
  const detectionState = useClassifier
    ? classifierResult.debugInfo.detectionState
    : motionSwingResult.detectionState;

  // TTS phase announcements for hands-free testing
  usePhaseAnnouncer({
    enabled: useClassifier && settings.debugOverlayEnabled,
    detectionState,
  });

  // Play "ready" cue when entering armed/address state
  const prevIsStillRef = useRef(false);
  useEffect(() => {
    if (isStill && !prevIsStillRef.current) {
      playAddressReady();
    }
    prevIsStillRef.current = isStill;
  }, [isStill, playAddressReady]);

  // Camera angle auto-detection — paused during address/swinging because backswing
  // shoulder separation exceeds DTL_THRESHOLD and would flip detection to face-on
  const classifierActive = classifierResult.isInAddress || classifierResult.isSwinging;
  const angleAutoDetectEnabled = isArmed && poseDetectionEnabled && cameraState === 'previewing' && !angleManualOverride && !classifierActive;
  const { detectedAngle, isDetecting: isDetectingAngle } = useCameraAngleDetection({
    enabled: angleAutoDetectEnabled,
    rawPoseData: rawPoseData ?? null,
  });

  // Apply auto-detected angle
  useEffect(() => {
    if (detectedAngle !== null && !angleManualOverride) {
      setCameraAngle(detectedAngle);
    }
  }, [detectedAngle, angleManualOverride, setCameraAngle]);

  // Reset manual override when disarming
  useEffect(() => {
    if (!isArmed) {
      setAngleManualOverride(false);
    }
  }, [isArmed]);

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

  // Session lifecycle — auto-create on camera mount, end on unmount
  const { tagClip, activeSession } = useSessionLifecycle({ isActive: true, role: 'camera' });
  const activeSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
  }, [activeSession]);

  // Rolling buffer recorder — only for motion detection path (classifier uses swing recorder)
  const rollingRecorderEnabled = useMotionDetect && isStill && cameraState === 'previewing';
  const handleRollingClipSaved = useCallback((clip: Clip) => {
    if (clip.sessionId) {
      tagClip(clip.id);
    }
    // Stay in previewing — rolling recorder re-arms automatically
    showToast(`Swing captured (${clip.duration}s)`, { variant: 'success' });
  }, [tagClip, showToast]);
  const handleRollingError = useCallback((error: string) => {
    showToast(`Recording Error: ${error}`, { variant: 'error' });
  }, [showToast]);
  const rollingRecorder = useRollingRecorder({
    recorderRef,
    enabled: rollingRecorderEnabled,
    recordingFps,
    sessionId: activeSession?.id ?? null,
    cameraAngle: settings.cameraAngle,
    onClipSaved: handleRollingClipSaved,
    onError: handleRollingError,
  });

  // Tempo calculation — extract from analytics snapshot at address→swinging transition
  const swingTempoRef = useRef<SwingTempo | null>(null);
  const analyticsSnapshot = classifierResult.analyticsSnapshot;
  useEffect(() => {
    if (
      analyticsSnapshot?.transition === 'address_to_swinging' &&
      analyticsSnapshot.rotationState
    ) {
      swingTempoRef.current = calculateSwingTempo(analyticsSnapshot.rotationState);
    } else if (analyticsSnapshot?.transition === 'swinging_to_idle') {
      // Reset after swing completes so next recording starts clean
      swingTempoRef.current = null;
    }
  }, [analyticsSnapshot]);

  // Swing recorder — classifier-driven, watches detectionState directly
  const swingRecorderEnabled = useClassifier && cameraState === 'previewing';
  const handleSwingClipSaved = useCallback((clip: Clip) => {
    if (clip.sessionId) {
      tagClip(clip.id);
    }
    showToast(`Swing captured (${clip.duration}s)`, { variant: 'success' });
  }, [tagClip, showToast]);
  const handleSwingError = useCallback((error: string) => {
    showToast(`Recording Error: ${error}`, { variant: 'error' });
  }, [showToast]);
  const swingRecorder = useSwingRecorder({
    recorderRef,
    enabled: swingRecorderEnabled,
    detectionState: classifierResult.debugInfo.detectionState,
    recordingFps,
    sessionId: activeSession?.id ?? null,
    cameraAngle: settings.cameraAngle,
    swingTempo: swingTempoRef.current,
    onClipSaved: handleSwingClipSaved,
    onError: handleSwingError,
  });

  // Connection analytics (GOL-76) — camera doesn't know the discovery method
  useConnectionAnalytics({
    autoConnectState: autoConnect.state,
    activeTransport: autoConnect.activeTransport,
    isConnected,
    connectionMethod: null,
    localPlatform: Platform.OS as 'ios' | 'android',
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

  const isRecording = swingRecorder.isRecording;

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
    isRecording,
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

  // Show arm button hint 1s after entering previewing (if not yet armed)
  useEffect(() => {
    if (cameraState !== 'previewing' || isArmed) return;

    const timer = setTimeout(() => {
      setShowArmHint(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cameraState, isArmed]);

  // Dismiss arm hint on first arm
  useEffect(() => {
    if (isArmed) setShowArmHint(false);
  }, [isArmed]);

  // Pulse ring animation for arm button hint
  useEffect(() => {
    if (!showArmHint) return;

    armHintRingScale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 0 }),
        withDelay(400, withTiming(1, { duration: 0 })),
      ),
      8,
    );

    armHintRingOpacity.value = withSequence(
      withTiming(0.6, { duration: 0 }),
      withRepeat(
        withSequence(
          withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) }),
          withTiming(0.6, { duration: 0 }),
          withDelay(400, withTiming(0.6, { duration: 0 })),
        ),
        8,
      ),
      withTiming(0, { duration: 300 }),
    );
  }, [showArmHint]);

  const armHintRingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: armHintRingScale.value }],
    opacity: armHintRingOpacity.value,
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

  // Determine which connection request to show — P2P invitation or server BLE handshake
  const p2pInvitation = autoConnect.pendingInvitation;
  const showConnectionRequest = !!p2pInvitation || !!pendingRequest;
  const connectionRequestDeviceName = p2pInvitation?.peerName ?? pendingRequest?.deviceName ?? '';
  const connectionRequestPlatform = p2pInvitation ? 'ios' : (pendingRequest?.platform ?? '');

  const handleAcceptConnection = useCallback(() => {
    if (p2pInvitation) {
      autoConnect.acceptInvitation();
      return;
    }
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, true);
    setPendingRequest(null);
  }, [p2pInvitation, autoConnect, pendingRequest, roomCode, respondToRequest]);

  const handleDeclineConnection = useCallback(() => {
    if (p2pInvitation) {
      autoConnect.rejectInvitation();
      return;
    }
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, false, 'declined');
    setPendingRequest(null);
  }, [p2pInvitation, autoConnect, pendingRequest, roomCode, respondToRequest]);

  const handleTimeoutConnection = useCallback(() => {
    if (p2pInvitation) {
      autoConnect.rejectInvitation();
      return;
    }
    if (!pendingRequest || !roomCode) return;
    respondToRequest(roomCode, pendingRequest.requesterId, false, 'timeout');
    setPendingRequest(null);
  }, [p2pInvitation, autoConnect, pendingRequest, roomCode, respondToRequest]);

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

  // Wire swing auto-detection refs — only for motion detection path
  // Classifier path uses useSwingRecorder which watches detectionState directly
  swingStartRef.current = useMotionDetect && rollingRecorderEnabled
    ? rollingRecorder.notifySwingDetected
    : null;
  swingEndRef.current = null;

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
      rollingRecorder.resume();
      swingRecorder.resume();
    }
  }, [syncProgress.state, rollingRecorder, swingRecorder]);

  // Record again from reviewing state
  const handleRecordAgain = useCallback(() => {
    setLastRecordedClip(null);
    setRecordingError(null);
    setCameraState('previewing');
    rollingRecorder.resume();
    swingRecorder.resume();
  }, [rollingRecorder, swingRecorder]);

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
        <ConnectionStatus
          step={connectionStep}
          quality={quality}
          compact
          presetLabel={isConnected && isStreamReady ? getPresetLabel(qualityPreset) : undefined}
        />
        {isAdvertising && !isConnected && (
          <View style={styles.discoverableBadge}>
            <Ionicons name="bluetooth" size={12} color={theme.colors.textTertiary} />
            <Text style={styles.discoverableText}>Discoverable</Text>
          </View>
        )}
        {autoDetectEnabled && (
          <View style={styles.autoBadge}>
            <Ionicons
              name={isStill ? 'fitness' : 'body'}
              size={12}
              color={isStill ? theme.colors.success : theme.colors.accent}
            />
            <Text style={[styles.autoBadgeText, isStill && styles.autoBadgeTextReady]}>
              {useClassifier
                ? (classifierResult.isSwinging ? 'Swing!' : classifierResult.isInAddress ? 'Address' : 'Watching')
                : (isStill ? 'Armed' : detectionState === 'swing' ? 'Swing!' : 'Watching')}
            </Text>
          </View>
        )}
        {isConnected && (() => {
          const transport = resolveNetworkTransport(autoConnect.activeTransport, quality?.candidateType);
          return transport ? <TransportBadge transport={transport} /> : null;
        })()}
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
                audio={false}
                format={visionFormat}
                fps={recordingFps}
                poseDetectionEnabled={poseDetectionEnabled}
                poseOverlayVisible={poseDetectionEnabled}
                poseData={rawPoseData}
                frameDiffEnabled={useMotionDetect}
              />
            ) : (
              <View style={styles.cameraPlaceholder}>
                <Text style={styles.placeholderText}>
                  {hasCameraPermission ? 'No camera device found' : 'Camera permission required'}
                </Text>
              </View>
            )}
            {autoDetectEnabled && settings.debugOverlayEnabled && (
              <DetectionDebugOverlay
                visible={true}
                debugInfo={useClassifier
                  ? {
                      mode: 'classifier' as const,
                      ...classifierResult.debugInfo,
                      isModelTrained: classifierResult.isModelTrained,
                    }
                  : {
                      mode: 'motion' as const,
                      ...motionSwingResult.debugInfo,
                    }
                }
              />
            )}
            {currentError && (
              <View style={styles.errorOverlay}>
                <Text style={styles.errorText}>{currentError}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Camera Angle Badge — auto-detected or manual override */}
        {(cameraState === 'connecting' || cameraState === 'previewing') && (
          <Pressable
            style={styles.angleBadgeContainer}
            onPress={() => {
              const nextAngle = settings.cameraAngle === 'dtl' ? 'face-on' : 'dtl';
              setCameraAngle(nextAngle);
              setAngleManualOverride(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isDetectingAngle
                ? 'Detecting camera angle'
                : `Camera angle: ${settings.cameraAngle === 'dtl' ? 'Down the line' : 'Face on'}. Tap to change.`
            }
          >
            {isDetectingAngle ? (
              <>
                <ActivityIndicator size={10} color="rgba(255,255,255,0.6)" />
                <Text style={styles.angleBadgeText}>Detecting…</Text>
              </>
            ) : (
              <>
                {!angleManualOverride && detectedAngle !== null && (
                  <Ionicons name="sparkles" size={10} color="rgba(255,255,255,0.8)" />
                )}
                <Text style={styles.angleBadgeTextActive}>
                  {settings.cameraAngle === 'dtl' ? 'DTL' : 'Face-On'}
                </Text>
              </>
            )}
          </Pressable>
        )}

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

        {/* Floating Arm Button — bottom-center */}
        {cameraState === 'previewing' && (
          <View style={[styles.floatingArmContainer, { bottom: insets.bottom + 16 }]}>
            {/* Pulse ring — behind button */}
            {showArmHint && !isArmed && (
              <Animated.View style={[styles.armHintRing, armHintRingAnimatedStyle]} />
            )}
            <ArmButton
              isArmed={isArmed}
              onPress={() => setIsArmed(prev => !prev)}
              disabled={!visionDevice || !hasCameraPermission}
              size={64}
            />
          </View>
        )}

        {/* Arm button tooltip — positioned independently for centering */}
        {cameraState === 'previewing' && showArmHint && !isArmed && (
          <View style={[styles.armHintTooltip, { bottom: insets.bottom + 88 }]}>
            <Text style={styles.hintTooltipText} numberOfLines={1}>Tap to start detecting</Text>
            <View style={styles.armHintTooltipArrow} />
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
              onPress={() => { setLastRecordedClip(null); setCameraState('previewing'); rollingRecorder.resume(); swingRecorder.resume(); }}
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

      {/* Connection Request Modal (P2P invitation or BLE tap handshake) */}
      <ConnectionRequestModal
        visible={showConnectionRequest}
        deviceName={connectionRequestDeviceName}
        platform={connectionRequestPlatform}
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
  autoBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  autoBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.accent,
  },
  autoBadgeTextReady: {
    color: theme.colors.success,
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
  floatingArmContainer: {
    position: 'absolute' as const,
    alignSelf: 'center' as const,
    zIndex: 10,
    overflow: 'visible' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  armHintRing: {
    position: 'absolute' as const,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: theme.colors.success,
  },
  armHintTooltip: {
    position: 'absolute' as const,
    alignSelf: 'center' as const,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    zIndex: 10,
  },
  armHintTooltipArrow: {
    position: 'absolute' as const,
    bottom: -8,
    alignSelf: 'center' as const,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0,0,0,0.7)',
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
  angleBadgeContainer: {
    position: 'absolute' as const,
    top: 12,
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 10,
  },
  angleBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.body,
    color: 'rgba(255,255,255,0.6)',
  },
  angleBadgeTextActive: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.palette.white,
  },
}));
