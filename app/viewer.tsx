import { StyleSheet, View, Text } from 'react-native';
import { useState, useEffect, useCallback } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { RemoteVideoView } from '@/src/components/video';
import { QRCodeScanner } from '@/src/components/pairing';
import { ConnectionStatus, HotspotSetupGuide } from '@/src/components/connection';
import { Button } from '@/src/components/ui';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { decodeQRPayload, isValidSwingLinkQR } from '@/src/services/discovery/qr-payload';
import type { ConnectionStep, QRCodePayload } from '@/src/types';

export default function ViewerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('scanning-qr');
  const [isScanning, setIsScanning] = useState(true);
  const [scannedPayload, setScannedPayload] = useState<QRCodePayload | null>(null);
  const [showHotspotGuide, setShowHotspotGuide] = useState(false);

  // Hooks
  const {
    connect: connectSignaling,
    joinRoom,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onIceCandidate,
  } = useSignaling({ autoConnect: false });

  const {
    peerConnection,
    remoteStream,
    handleOffer,
    handleIceCandidate,
    isConnected,
  } = useWebRTCConnection({
    onIceCandidate: sendIceCandidate,
  });

  const { quality } = useConnectionQuality({
    peerConnection,
    enabled: isConnected,
  });

  // Handle QR code scan
  const handleScan = useCallback(async (data: string) => {
    if (!isValidSwingLinkQR(data)) {
      console.log('Invalid QR code scanned');
      return;
    }

    const payload = decodeQRPayload(data);
    if (!payload) return;

    setIsScanning(false);
    setScannedPayload(payload);
    setConnectionStep('exchanging-signaling');

    // Connect to signaling server and join room
    await connectSignaling();

    // Extract room code from session ID (first part before dash)
    const roomToJoin = payload.sessionId.split('-')[0];
    const joined = await joinRoom(roomToJoin);

    if (!joined) {
      setConnectionStep('failed');
      return;
    }

    setConnectionStep('establishing-webrtc');
  }, [connectSignaling, joinRoom]);

  // Handle offer from camera
  useEffect(() => {
    const unsubscribe = onOffer(async (sdp) => {
      const answer = await handleOffer({ type: 'offer', sdp });
      if (answer) {
        sendAnswer(answer.sdp);
      }
    });
    return unsubscribe;
  }, [onOffer, handleOffer, sendAnswer]);

  // Handle ICE candidates from camera
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

  const handleRescan = useCallback(() => {
    setIsScanning(true);
    setScannedPayload(null);
    setConnectionStep('scanning-qr');
    setShowHotspotGuide(false);
  }, []);

  const styles = createStyles(isDark);

  // Show hotspot guide if needed
  if (showHotspotGuide && scannedPayload) {
    return (
      <View style={styles.container}>
        <HotspotSetupGuide
          hotspotSsid={scannedPayload.hotspotSsid}
          hotspotPassword={scannedPayload.hotspotPassword}
          isCamera={false}
          isDark={isDark}
        />
        <View style={styles.actions}>
          <Button
            title="I'm Connected"
            onPress={() => {
              setShowHotspotGuide(false);
              setConnectionStep('connecting-to-hotspot');
            }}
            variant="primary"
            isDark={isDark}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Video or Scanner */}
      <View style={styles.mainContent}>
        {isConnected || remoteStream ? (
          <RemoteVideoView
            stream={remoteStream}
            isConnecting={connectionStep === 'establishing-webrtc'}
          />
        ) : isScanning ? (
          <QRCodeScanner
            onScan={handleScan}
            isScanning={isScanning}
            isDark={isDark}
          />
        ) : (
          <View style={styles.connectingContainer}>
            <Text style={[styles.connectingText, isDark && styles.connectingTextDark]}>
              Connecting to camera...
            </Text>
          </View>
        )}
      </View>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {connectionStep === 'failed' && (
          <Button
            title="Scan Again"
            onPress={handleRescan}
            variant="primary"
            icon="qr-code"
            isDark={isDark}
          />
        )}

        {isConnected && (
          <View style={styles.qualityInfo}>
            <Text style={[styles.qualityLabel, isDark && styles.qualityLabelDark]}>
              Stream Quality
            </Text>
            <Text style={[styles.qualityValue, isDark && styles.qualityValueDark]}>
              {quality ? `${quality.latencyMs}ms latency` : 'Measuring...'}
            </Text>
          </View>
        )}
      </View>
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
    mainContent: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
    },
    connectingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#0a0a1e' : '#e0e0e0',
      borderRadius: 16,
    },
    connectingText: {
      fontSize: 18,
      color: '#666',
    },
    connectingTextDark: {
      color: '#888',
    },
    statusContainer: {
      marginTop: 16,
    },
    actions: {
      marginTop: 16,
    },
    qualityInfo: {
      alignItems: 'center',
      padding: 16,
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 12,
    },
    qualityLabel: {
      fontSize: 12,
      color: '#666',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    qualityLabelDark: {
      color: '#888',
    },
    qualityValue: {
      fontSize: 24,
      fontWeight: '600',
      color: '#4CAF50',
      marginTop: 4,
    },
    qualityValueDark: {
      color: '#4CAF50',
    },
  });
