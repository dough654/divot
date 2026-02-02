import { StyleSheet, View, Text, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';
import { LocalVideoView } from '@/src/components/video';
import { QRCodeDisplay } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import { useLocalMediaStream } from '@/src/hooks/use-local-media-stream';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep } from '@/src/types';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showPerformanceTip, setShowPerformanceTip] = useState(false);

  // Hooks
  const {
    stream: localStream,
    error: cameraError,
    isFrontCamera,
    startStream,
    toggleCamera,
  } = useLocalMediaStream({ video: true, audio: true });

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

  const styles = createStyles(isDark);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Video Preview */}
      <View style={styles.videoContainer}>
        <LocalVideoView
          stream={localStream}
          isFrontCamera={isFrontCamera}
          onFlipCamera={toggleCamera}
        />
        {cameraError && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorText}>{cameraError}</Text>
          </View>
        )}
      </View>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} />
      </View>

      {/* QR Code */}
      <View style={styles.pairingContainer}>
        {qrPayload ? (
          <QRCodeDisplay
            value={qrPayload}
            roomCode={formatRoomCode(roomCode!)}
            size={160}
            isDark={isDark}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
              Generating QR code...
            </Text>
          </View>
        )}
      </View>

      {/* Performance tip button */}
      {!isConnected && connectionStep === 'displaying-qr' && (
        <Pressable
          style={[styles.tipButton, isDark && styles.tipButtonDark]}
          onPress={() => setShowPerformanceTip(true)}
        >
          <Ionicons name="flash" size={18} color="#FF9800" />
          <Text style={styles.tipButtonText}>Want the best performance?</Text>
        </Pressable>
      )}

      {/* Performance tip modal */}
      <Modal
        visible={showPerformanceTip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPerformanceTip(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPerformanceTip(false)}
        >
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <View style={styles.modalHeader}>
              <Ionicons name="flash" size={24} color="#FF9800" />
              <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
                Best Performance Tip
              </Text>
            </View>

            <Text style={[styles.modalText, isDark && styles.modalTextDark]}>
              For the lowest latency and most reliable connection:
            </Text>

            <View style={styles.tipSteps}>
              <View style={styles.tipStep}>
                <Text style={styles.tipStepNumber}>1</Text>
                <Text style={[styles.tipStepText, isDark && styles.tipStepTextDark]}>
                  Enable this phone's mobile hotspot
                </Text>
              </View>
              <View style={styles.tipStep}>
                <Text style={styles.tipStepNumber}>2</Text>
                <Text style={[styles.tipStepText, isDark && styles.tipStepTextDark]}>
                  Connect the viewer device to your hotspot
                </Text>
              </View>
              <View style={styles.tipStep}>
                <Text style={styles.tipStepNumber}>3</Text>
                <Text style={[styles.tipStepText, isDark && styles.tipStepTextDark]}>
                  Then scan the QR code or enter the room code
                </Text>
              </View>
            </View>

            <Text style={[styles.modalSubtext, isDark && styles.modalSubtextDark]}>
              This creates a direct device-to-device connection without going through a WiFi router.
            </Text>

            <Pressable
              style={styles.modalCloseButton}
              onPress={() => setShowPerformanceTip(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got it</Text>
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
      padding: 16,
    },
    videoContainer: {
      flex: 1,
      maxHeight: '40%',
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
    statusContainer: {
      marginTop: 16,
    },
    pairingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      fontSize: 16,
      color: '#666',
    },
    loadingTextDark: {
      color: '#888',
    },
    tipButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: '#FFF3E0',
      borderRadius: 8,
      marginTop: 16,
    },
    tipButtonDark: {
      backgroundColor: '#3a2a1a',
    },
    tipButtonText: {
      color: '#FF9800',
      fontSize: 14,
      fontWeight: '500',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 360,
    },
    modalContentDark: {
      backgroundColor: '#2a2a4e',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: '#1a1a2e',
    },
    modalTitleDark: {
      color: '#ffffff',
    },
    modalText: {
      fontSize: 14,
      color: '#666',
      marginBottom: 16,
      lineHeight: 20,
    },
    modalTextDark: {
      color: '#aaa',
    },
    tipSteps: {
      gap: 12,
      marginBottom: 16,
    },
    tipStep: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    tipStepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#FF9800',
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 24,
    },
    tipStepText: {
      flex: 1,
      fontSize: 14,
      color: '#333',
      lineHeight: 20,
    },
    tipStepTextDark: {
      color: '#ccc',
    },
    modalSubtext: {
      fontSize: 13,
      color: '#888',
      fontStyle: 'italic',
      marginBottom: 20,
      lineHeight: 18,
    },
    modalSubtextDark: {
      color: '#777',
    },
    modalCloseButton: {
      backgroundColor: '#4CAF50',
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    modalCloseButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
