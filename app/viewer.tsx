import { View, Text, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';

import { useThemedStyles, makeThemedStyles, useOrientation } from '@/src/hooks';
import type { Theme } from '@/src/context';
import { RemoteVideoView } from '@/src/components/video';
import { QRCodeScanner, ManualCodeEntry } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { Button, ErrorDetail } from '@/src/components/ui';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useClipSync } from '@/src/hooks/use-clip-sync';
import { useAutoReconnect } from '@/src/hooks/use-auto-reconnect';
import { decodeQRPayload, isValidSwingLinkQR } from '@/src/services/discovery/qr-payload';
import { connectionErrors, getSignalingError } from '@/src/utils/error-messages';
import type { ConnectionStep } from '@/src/types';
import type { Clip } from '@/src/types/recording';
import type { RecoveryAction } from '@/src/utils/error-messages';

export default function ViewerScreen() {
  const styles = useThemedStyles(createStyles);
  const { isLandscape, lockToPortrait, unlock } = useOrientation();

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('scanning-qr');
  const [isScanning, setIsScanning] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [connectionErrorCode, setConnectionErrorCode] = useState<string | null>(null);
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
    remoteStream,
    handleOffer,
    handleIceCandidate,
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

  // Lock to portrait during QR scanning, unlock when connected
  useEffect(() => {
    if (isScanning) {
      lockToPortrait();
    } else {
      unlock();
    }
    return () => {
      unlock();
    };
  }, [isScanning, lockToPortrait, unlock]);

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
    setConnectionErrorCode(null);

    await connectSignaling();
    const joined = await joinRoom(roomCode);

    if (!joined) {
      setConnectionErrorCode('ROOM_NOT_FOUND');
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
      setConnectionErrorCode(null);
    } else if (reconnectionState.isReconnecting) {
      setConnectionStep('reconnecting');
    } else if (reconnectionState.lastDisconnectReason && !reconnectionState.isReconnecting && reconnectionState.attempt > 0) {
      setConnectionErrorCode('RECONNECT_FAILED');
      setConnectionStep('reconnect-failed');
    }
  }, [isConnected, reconnectionState]);

  // Get the current error info based on error code
  const currentError = useMemo(() => {
    if (!connectionErrorCode) return null;

    if (connectionErrorCode === 'RECONNECT_FAILED') {
      return connectionErrors.reconnectFailed;
    }
    return getSignalingError(connectionErrorCode);
  }, [connectionErrorCode]);

  const handleRescan = useCallback(() => {
    isProcessingScan.current = false;
    setIsScanning(true);
    setConnectionStep('scanning-qr');
    setUseManualEntry(false);
    setConnectionErrorCode(null);
  }, []);

  // Handle recovery actions from ErrorDetail
  const handleErrorAction = useCallback((action: RecoveryAction['action']) => {
    switch (action) {
      case 'retry':
        if (roomCodeRef.current) {
          setConnectionErrorCode(null);
          proceedWithConnection(roomCodeRef.current);
        } else {
          handleRescan();
        }
        break;
      case 'rescan':
        handleRescan();
        break;
      case 'settings':
        Linking.openSettings();
        break;
      case 'dismiss':
        handleRescan();
        break;
      default:
        handleRescan();
    }
  }, [proceedWithConnection, handleRescan]);

  // Handle manual code entry
  const handleManualCodeSubmit = useCallback(async (code: string) => {
    if (isProcessingScan.current) return;

    isProcessingScan.current = true;
    setIsScanning(false);

    await proceedWithConnection(code);
  }, [proceedWithConnection]);

  return (
    <SafeAreaView
      style={styles.container}
      edges={isLandscape ? ['bottom', 'left', 'right'] : ['bottom']}
    >
      {/* Connection Status - top bar or overlay */}
      {isLandscape && isConnected ? (
        <View style={styles.topBarOverlay}>
          <ConnectionStatus step={connectionStep} quality={quality} compact />
        </View>
      ) : (
        <View style={styles.topBar}>
          <ConnectionStatus step={connectionStep} quality={quality} compact />
        </View>
      )}

      {/* Video or Scanner or Manual Entry */}
      <View style={styles.mainContent}>
        {isConnected ? (
          <RemoteVideoView
            stream={remoteStream}
            isConnecting={!remoteStream}
          />
        ) : isScanning ? (
          useManualEntry ? (
            <ManualCodeEntry
              onSubmit={handleManualCodeSubmit}
              onSwitchToScanner={() => setUseManualEntry(false)}
              isSubmitting={connectionStep === 'exchanging-signaling'}
            />
          ) : (
            <QRCodeScanner
              onScan={handleScan}
              isScanning={isScanning}
            />
          )
        ) : (
          <View style={styles.connectingContainer}>
            <Text style={styles.connectingText}>
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
          />
        )}

        {(connectionStep === 'failed' || connectionStep === 'reconnect-failed') && currentError && (
          <ErrorDetail
            error={currentError}
            onAction={handleErrorAction}
          />
        )}

        {isConnected && !isLandscape && (
          <View style={styles.qualityInfo}>
            <Text style={styles.qualityLabel}>
              Preview
            </Text>
            <Text style={styles.qualityValue}>
              {remoteStream ? 'Live' : 'Waiting...'}
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

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  topBar: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  topBarOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  mainContent: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden' as const,
  },
  connectingContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.backgroundTertiary,
  },
  connectingText: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  bottomBar: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  qualityInfo: {
    alignItems: 'center' as const,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  qualityLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  qualityValue: {
    fontSize: 24,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.success,
    marginTop: theme.spacing.xs,
  },
}));
