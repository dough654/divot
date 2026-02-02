import { StyleSheet, View, Text } from 'react-native';
import { useState, useEffect, useCallback } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { LocalVideoView } from '@/src/components/video';
import { QRCodeDisplay } from '@/src/components/pairing';
import { ConnectionStatus, HotspotSetupGuide } from '@/src/components/connection';
import { Button } from '@/src/components/ui';
import { useLocalMediaStream } from '@/src/hooks/use-local-media-stream';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { generateSessionId, formatRoomCode } from '@/src/utils';
import type { ConnectionStep } from '@/src/types';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [sessionId] = useState(() => generateSessionId());
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [showHotspotGuide, setShowHotspotGuide] = useState(false);

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
  const qrPayload = encodeQRPayload({
    sessionId,
    mode: 'auto',
    signalingUrl: 'https://swinglink-signaling.fly.dev',
  });

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

  const handleSwitchToHotspot = useCallback(() => {
    setShowHotspotGuide(true);
    setConnectionStep('setting-up-hotspot');
  }, []);

  const styles = createStyles(isDark);

  return (
    <View style={styles.container}>
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

      {/* QR Code or Hotspot Guide */}
      <View style={styles.pairingContainer}>
        {showHotspotGuide ? (
          <HotspotSetupGuide isCamera={true} isDark={isDark} />
        ) : (
          roomCode && (
            <QRCodeDisplay
              value={qrPayload}
              roomCode={formatRoomCode(roomCode)}
              size={160}
              isDark={isDark}
            />
          )
        )}
      </View>

      {/* Actions */}
      {!isConnected && connectionStep === 'local-discovery-failed' && !showHotspotGuide && (
        <View style={styles.actions}>
          <Button
            title="Use Hotspot Instead"
            onPress={handleSwitchToHotspot}
            variant="outline"
            icon="phone-portrait"
            isDark={isDark}
          />
        </View>
      )}
    </View>
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
    actions: {
      marginTop: 16,
    },
  });
