import { StyleSheet, View, Text, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';
import { LocalVideoView } from '@/src/components/video';
import { QRCodeDisplay, QRCodeButton } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import { useLocalMediaStream } from '@/src/hooks/use-local-media-stream';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep } from '@/src/types';

const MIN_LOADING_TIME_MS = 1500;

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isPulsing, setIsPulsing] = useState(true);
  const [isButtonLoading, setIsButtonLoading] = useState(true);
  const loadingStartTime = useState(() => Date.now())[0];

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

  const styles = createStyles(isDark);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Connection Status - top bar */}
      <View style={styles.topBar}>
        <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} compact />
      </View>

      {/* Video Preview - full width */}
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

      {/* Bottom bar with QR button */}
      <View style={styles.bottomBar}>
        {/* QR Code Button */}
        {!isConnected && (
          <QRCodeButton
            roomCode={roomCode ? formatRoomCode(roomCode) : null}
            onPress={handleQRButtonPress}
            isPulsing={isPulsing}
            isLoading={isButtonLoading}
            isDark={isDark}
          />
        )}

        {/* Connected indicator */}
        {isConnected && (
          <View style={[styles.connectedBadge, isDark && styles.connectedBadgeDark]}>
            <Ionicons name="videocam" size={18} color="#4CAF50" />
            <Text style={styles.connectedText}>Streaming to viewer</Text>
          </View>
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
    bottomBar: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    connectedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#e8f5e9',
      borderRadius: 8,
      paddingVertical: 10,
      marginTop: 4,
    },
    connectedBadgeDark: {
      backgroundColor: '#1a3a1a',
    },
    connectedText: {
      fontSize: 14,
      fontWeight: '500',
      color: '#4CAF50',
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
