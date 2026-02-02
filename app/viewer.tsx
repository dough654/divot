import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { RemoteVideoView } from '@/src/components/video';
import { QRCodeScanner, ManualCodeEntry } from '@/src/components/pairing';
import { ConnectionStatus, HotspotConnectInstructions } from '@/src/components/connection';
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
  const [useManualEntry, setUseManualEntry] = useState(false);
  const isProcessingScan = useRef(false);

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

  // Connect to the signaling server and join the room
  const proceedWithConnection = useCallback(async (roomCode: string) => {
    setConnectionStep('exchanging-signaling');

    await connectSignaling();
    const joined = await joinRoom(roomCode);

    if (!joined) {
      setConnectionStep('failed');
      return;
    }

    setConnectionStep('establishing-webrtc');
  }, [connectSignaling, joinRoom]);

  // Handle QR code scan
  const handleScan = useCallback(async (data: string) => {
    // Prevent multiple scans from processing
    if (isProcessingScan.current) return;

    if (!isValidSwingLinkQR(data)) {
      console.log('Invalid QR code scanned');
      return;
    }

    const payload = decodeQRPayload(data);
    if (!payload) return;

    isProcessingScan.current = true;
    setIsScanning(false);
    setScannedPayload(payload);

    // If hotspot mode, show credentials first and wait for user to connect
    if (payload.mode === 'hotspot' && payload.hotspotSsid) {
      setShowHotspotGuide(true);
      setConnectionStep('connecting-to-hotspot');
      return;
    }

    // Auto mode - proceed immediately
    await proceedWithConnection(payload.sessionId);
  }, [proceedWithConnection]);

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
    isProcessingScan.current = false;
    setIsScanning(true);
    setScannedPayload(null);
    setConnectionStep('scanning-qr');
    setShowHotspotGuide(false);
    setUseManualEntry(false);
  }, []);

  // Handle manual code entry
  const handleManualCodeSubmit = useCallback(async (code: string) => {
    if (isProcessingScan.current) return;

    isProcessingScan.current = true;
    setIsScanning(false);

    // Create a minimal payload with just the room code
    const payload: QRCodePayload = {
      sessionId: code,
      mode: 'auto',
    };
    setScannedPayload(payload);
    setConnectionStep('exchanging-signaling');

    // Connect to signaling server and join room
    await connectSignaling();
    const joined = await joinRoom(code);

    if (!joined) {
      setConnectionStep('failed');
      return;
    }

    setConnectionStep('establishing-webrtc');
  }, [connectSignaling, joinRoom]);

  const styles = createStyles(isDark);

  // Handle user confirming they've connected to the hotspot
  const handleHotspotConnected = useCallback(async () => {
    if (!scannedPayload) return;
    setShowHotspotGuide(false);
    await proceedWithConnection(scannedPayload.sessionId);
  }, [scannedPayload, proceedWithConnection]);

  // Show hotspot connect instructions if needed
  if (showHotspotGuide && scannedPayload) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.instructionsContainer}>
          <HotspotConnectInstructions
            onConnected={handleHotspotConnected}
            onCancel={handleRescan}
            isDark={isDark}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Video or Scanner or Manual Entry */}
      <View style={styles.mainContent}>
        {isConnected || remoteStream ? (
          <RemoteVideoView
            stream={remoteStream}
            isConnecting={connectionStep === 'establishing-webrtc'}
          />
        ) : isScanning ? (
          useManualEntry ? (
            <ManualCodeEntry
              onSubmit={handleManualCodeSubmit}
              onSwitchToScanner={() => setUseManualEntry(false)}
              isSubmitting={connectionStep === 'exchanging-signaling'}
              isDark={isDark}
            />
          ) : (
            <QRCodeScanner
              onScan={handleScan}
              isScanning={isScanning}
              isDark={isDark}
            />
          )
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
        {isScanning && !useManualEntry && (
          <Button
            title="Enter Code Manually"
            onPress={() => setUseManualEntry(true)}
            variant="secondary"
            icon="keypad-outline"
            isDark={isDark}
          />
        )}

        {connectionStep === 'failed' && (
          <Button
            title="Try Again"
            onPress={handleRescan}
            variant="primary"
            icon="refresh"
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
    instructionsContainer: {
      flex: 1,
      justifyContent: 'center',
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
    actionSpacer: {
      height: 12,
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
