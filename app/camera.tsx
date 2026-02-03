import { StyleSheet, View, Text, Pressable, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { VideoFile } from 'react-native-vision-camera';

import { useColorScheme } from '@/components/useColorScheme';
import { LocalVideoView } from '@/src/components/video';
import { QRCodeDisplay, QRCodeButton } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import {
  RecordingButton,
  RecordingIndicator,
  VisionCameraRecorder,
  VisionCameraRecorderRef,
} from '@/src/components/recording';
import { useLocalMediaStream } from '@/src/hooks/use-local-media-stream';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useVisionCamera } from '@/src/hooks/use-vision-camera';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { saveClip } from '@/src/services/recording/clip-storage';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep } from '@/src/types';

const MIN_LOADING_TIME_MS = 1500;

type CameraMode = 'streaming' | 'recording';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isPulsing, setIsPulsing] = useState(true);
  const [isButtonLoading, setIsButtonLoading] = useState(true);
  const loadingStartTime = useState(() => Date.now())[0];

  // Recording mode state
  const [cameraMode, setCameraMode] = useState<CameraMode>('streaming');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const recorderRef = useRef<VisionCameraRecorderRef>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingDurationRef = useRef(0);

  // Hooks for streaming mode
  const {
    stream: localStream,
    error: cameraError,
    isFrontCamera,
    startStream,
    stopStream,
    toggleCamera: toggleWebRTCCamera,
  } = useLocalMediaStream({ video: true, audio: true });

  // Hooks for recording mode
  const {
    device: visionDevice,
    hasCameraPermission,
    error: visionCameraError,
    toggleCamera: toggleVisionCamera,
    isFrontCamera: visionIsFrontCamera,
  } = useVisionCamera({ autoRequestPermissions: true });

  const {
    roomCode,
    connect: connectSignaling,
    createRoom,
    sendOffer,
    sendIceCandidate,
    onAnswer,
    onIceCandidate,
    onPeerJoined,
  } = useSignaling({ autoConnect: false });

  const {
    peerConnection,
    createOffer,
    handleAnswer,
    handleIceCandidate,
    isConnected,
  } = useWebRTCConnection({
    localStream,
    onIceCandidate: sendIceCandidate,
  });

  const { quality } = useConnectionQuality({
    peerConnection,
    enabled: isConnected,
  });

  // QR code payload
  const qrPayload = roomCode
    ? encodeQRPayload({
        sessionId: roomCode,
        mode: 'auto',
        signalingUrl: 'https://swinglink-signaling.fly.dev',
      })
    : null;

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

  // Start camera and connection on mount
  useEffect(() => {
    const initialize = async () => {
      setConnectionStep('generating-session');
      await startStream();
      await connectSignaling();
      const code = await createRoom();
      if (code) {
        setConnectionStep('displaying-qr');
      }
    };
    initialize();
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

  // Update connection step based on WebRTC state
  useEffect(() => {
    if (isConnected) {
      setConnectionStep('connected');
    }
  }, [isConnected]);

  const handleQRButtonPress = () => {
    setShowQRModal(true);
    if (isPulsing) {
      setIsPulsing(false);
    }
  };

  // Switch to recording mode
  const enterRecordingMode = useCallback(() => {
    stopStream();
    setCameraMode('recording');
    setRecordingError(null);
  }, [stopStream]);

  // Switch back to streaming mode
  const exitRecordingMode = useCallback(async () => {
    if (isRecording) {
      // Stop recording first if still recording
      await handleStopRecording();
    }
    setCameraMode('streaming');
    await startStream();
  }, [isRecording, startStream]);

  // Handle recording toggle
  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  }, [isRecording]);

  const handleStartRecording = useCallback(() => {
    if (!recorderRef.current) {
      setRecordingError('Camera not ready');
      return;
    }

    setRecordingError(null);
    setIsRecording(true);

    recorderRef.current.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        // Use ref to get current duration (avoids closure issue)
        const duration = recordingDurationRef.current;
        setIsRecording(false);

        try {
          await saveClip({
            path: video.path,
            duration,
            fps: 30, // Default for now
          });

          Alert.alert(
            'Recording Saved',
            `${duration}s clip saved. View it in My Clips.`,
            [{ text: 'OK' }]
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to save recording';
          setRecordingError(errorMsg);
          Alert.alert('Save Failed', errorMsg);
        }
      },
      onRecordingError: (error: unknown) => {
        setIsRecording(false);
        const errorMsg = error instanceof Error ? error.message : 'Recording failed';
        setRecordingError(errorMsg);
        Alert.alert('Recording Error', errorMsg);
      },
    });
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!recorderRef.current) return;

    try {
      await recorderRef.current.stopRecording();
    } catch (err) {
      console.error('Error stopping recording:', err);
    }
  }, []);

  const handleToggleCamera = useCallback(() => {
    if (cameraMode === 'recording') {
      toggleVisionCamera();
    } else {
      toggleWebRTCCamera();
    }
  }, [cameraMode, toggleVisionCamera, toggleWebRTCCamera]);

  const styles = createStyles(isDark);

  const showVisionCamera = cameraMode === 'recording' && visionDevice && hasCameraPermission;
  const currentError = cameraMode === 'recording' ? (visionCameraError || recordingError) : cameraError;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Connection Status - top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarContent}>
          <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} compact />
          {cameraMode === 'recording' && (
            <RecordingIndicator
              duration={recordingDuration}
              visible={isRecording}
              compact
            />
          )}
        </View>
      </View>

      {/* Video Preview - full width */}
      <View style={styles.videoContainer}>
        {showVisionCamera ? (
          <VisionCameraRecorder
            ref={recorderRef}
            device={visionDevice}
            isActive={cameraMode === 'recording'}
            isFrontCamera={visionIsFrontCamera}
            onFlipCamera={handleToggleCamera}
          />
        ) : (
          <LocalVideoView
            stream={localStream}
            isFrontCamera={isFrontCamera}
            onFlipCamera={handleToggleCamera}
          />
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

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {cameraMode === 'streaming' ? (
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

            {/* Connected indicator and record button */}
            {isConnected && (
              <View style={styles.connectedSection}>
                <View style={[styles.connectedBadge, isDark && styles.connectedBadgeDark]}>
                  <Ionicons name="videocam" size={18} color="#4CAF50" />
                  <Text style={styles.connectedText}>Streaming to viewer</Text>
                </View>
              </View>
            )}

            {/* Record mode button */}
            <Pressable
              style={[styles.recordModeButton, isDark && styles.recordModeButtonDark]}
              onPress={enterRecordingMode}
            >
              <View style={styles.recordModeIcon}>
                <Ionicons name="radio-button-on" size={20} color="#ff453a" />
              </View>
              <Text style={[styles.recordModeText, isDark && styles.recordModeTextDark]}>
                Enter Recording Mode
              </Text>
              <Text style={[styles.recordModeSubtext, isDark && styles.recordModeSubtextDark]}>
                Pauses streaming to enable high-quality recording
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Recording mode controls */}
            <View style={styles.recordingControls}>
              <RecordingButton
                isRecording={isRecording}
                onPress={handleRecordPress}
                disabled={!visionDevice || !hasCameraPermission}
              />
            </View>

            {/* Exit recording mode button */}
            <Pressable
              style={[styles.exitRecordingButton, isDark && styles.exitRecordingButtonDark]}
              onPress={exitRecordingMode}
              disabled={isRecording}
            >
              <Ionicons name="arrow-back" size={20} color={isDark ? '#fff' : '#1a1a2e'} />
              <Text style={[styles.exitRecordingText, isDark && styles.exitRecordingTextDark]}>
                {isRecording ? 'Stop recording to exit' : 'Back to Streaming'}
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
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    videoContainer: {
      flex: 1,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 16,
      overflow: 'hidden',
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
    recordModeButton: {
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    recordModeButtonDark: {
      backgroundColor: '#2a2a4e',
      borderColor: '#3a3a5e',
    },
    recordModeIcon: {
      marginBottom: 8,
    },
    recordModeText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1a1a2e',
      marginBottom: 4,
    },
    recordModeTextDark: {
      color: '#fff',
    },
    recordModeSubtext: {
      fontSize: 13,
      color: '#666',
    },
    recordModeSubtextDark: {
      color: '#999',
    },
    recordingControls: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    exitRecordingButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#f0f0f0',
      borderRadius: 8,
      paddingVertical: 12,
    },
    exitRecordingButtonDark: {
      backgroundColor: '#2a2a4e',
    },
    exitRecordingText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#1a1a2e',
    },
    exitRecordingTextDark: {
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
