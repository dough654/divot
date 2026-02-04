import { StyleSheet, View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';

import { useColorScheme } from '@/components/useColorScheme';
import { PreviewFrameView } from '@/src/components/video';
import { QRCodeScanner, ManualCodeEntry } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { Button } from '@/src/components/ui';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useClipSync } from '@/src/hooks/use-clip-sync';
import { usePreviewReceiver } from '@/src/hooks/use-preview-receiver';
import { useAutoReconnect } from '@/src/hooks/use-auto-reconnect';
import { decodeQRPayload, isValidSwingLinkQR } from '@/src/services/discovery/qr-payload';
import type { ConnectionStep } from '@/src/types';
import type { Clip } from '@/src/types/recording';

export default function ViewerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('scanning-qr');
  const [isScanning, setIsScanning] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const isProcessingScan = useRef(false);

  const roomCodeRef = useRef<string | null>(null);
  const [wasConnected, setWasConnected] = useState(false);

  // Hooks
  const {
    connectionState: signalingConnectionState,
    connect: connectSignaling,
    reconnectSignaling,
    joinRoom,
    rejoinRoom,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onIceCandidate,
  } = useSignaling({ autoConnect: false });

  const {
    peerConnection,
    handleOffer,
    handleIceCandidate,
    restartIce,
    renegotiate,
    isConnected,
    dataChannel,
    status: webrtcStatus,
  } = useWebRTCConnection({
    onIceCandidate: sendIceCandidate,
  });

  const { quality } = useConnectionQuality({
    peerConnection,
    enabled: isConnected,
  });

  const router = useRouter();
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Handle incoming clip transfers
  const handleClipReceived = useCallback((clip: Clip) => {
    setShowTransferModal(false);
    Alert.alert(
      'Clip Received',
      `"${clip.name || 'Swing Recording'}" saved to your clips.`,
      [
        { text: 'View Now', onPress: () => router.push(`/playback/${clip.id}`) },
        { text: 'Later', style: 'cancel' },
      ]
    );
  }, [router]);

  const { progress: syncProgress, cancelTransfer } = useClipSync({
    dataChannel,
    onClipReceived: handleClipReceived,
  });

  // Preview frame receiver
  const { latestFrame, isReceiving } = usePreviewReceiver({ dataChannel });

  const isSyncing = syncProgress.state === 'sending' || syncProgress.state === 'receiving';

  // Track wasConnected
  useEffect(() => {
    if (isConnected && !wasConnected) {
      setWasConnected(true);
    }
  }, [isConnected, wasConnected]);

  // Auto-reconnect (viewer: restartIce/renegotiate/sendOffer are no-ops since camera initiates)
  const noopSdpAction = useCallback(async () => null, []);
  const { reconnectionState } = useAutoReconnect({
    role: 'viewer',
    iceConnectionState: webrtcStatus.iceConnectionState,
    signalingConnectionState,
    wasConnected,
    roomCode: roomCodeRef.current,
    isRecording: false,
    isTransferring: isSyncing,
    restartIce: noopSdpAction,
    renegotiate: noopSdpAction,
    sendOffer: () => {},
    reconnectSignaling,
    rejoinRoom,
  });

  // Show transfer modal when receiving
  useEffect(() => {
    if (syncProgress.state === 'receiving') {
      setShowTransferModal(true);
    }
  }, [syncProgress.state]);

  // Connect to the signaling server and join the room
  const proceedWithConnection = useCallback(async (roomCode: string) => {
    roomCodeRef.current = roomCode;
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

  const handleRescan = useCallback(() => {
    isProcessingScan.current = false;
    setIsScanning(true);
    setConnectionStep('scanning-qr');
    setUseManualEntry(false);
  }, []);

  // Handle manual code entry
  const handleManualCodeSubmit = useCallback(async (code: string) => {
    if (isProcessingScan.current) return;

    isProcessingScan.current = true;
    setIsScanning(false);

    await proceedWithConnection(code);
  }, [proceedWithConnection]);

  const styles = createStyles(isDark);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Connection Status - top bar */}
      <View style={styles.topBar}>
        <ConnectionStatus step={connectionStep} quality={quality} isDark={isDark} compact />
      </View>

      {/* Video or Scanner or Manual Entry */}
      <View style={styles.mainContent}>
        {isConnected ? (
          <PreviewFrameView
            latestFrame={latestFrame}
            isConnected={isConnected}
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

      {/* Actions */}
      <View style={styles.bottomBar}>
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
              Preview
            </Text>
            <Text style={[styles.qualityValue, isDark && styles.qualityValueDark]}>
              {isReceiving ? 'Live' : 'Waiting...'}
            </Text>
          </View>
        )}
      </View>

      {/* Transfer Progress Modal */}
      <TransferProgressModal
        visible={showTransferModal}
        progress={syncProgress}
        onCancel={cancelTransfer}
        onDismiss={() => setShowTransferModal(false)}
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
    mainContent: {
      flex: 1,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 16,
      overflow: 'hidden',
    },
    connectingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#0a0a1e' : '#e0e0e0',
    },
    connectingText: {
      fontSize: 18,
      color: '#666',
    },
    connectingTextDark: {
      color: '#888',
    },
    bottomBar: {
      paddingHorizontal: 12,
      paddingVertical: 12,
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
