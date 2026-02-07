import { View, Text, Pressable, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
    <View style={styles.container}>
      {/* Connection Status - top bar or overlay */}
      {isLandscape && isConnected ? (
        <View style={[styles.topBarOverlay, { top: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <ConnectionStatus step={connectionStep} quality={quality} compact />
        </View>
      ) : (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
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
      <View style={[styles.bottomBar, { bottom: 10 + insets.bottom }]}>
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
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  backButton: {
    padding: 4,
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden' as const,
  },
  connectingContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.background,
  },
  connectingText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  bottomBar: {
    position: 'absolute' as const,
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  qualityInfo: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    width: '100%' as const,
    backgroundColor: 'transparent',
  },
  qualityLabel: {
    fontFamily: theme.fontFamily.body,
    fontSize: 10,
    textTransform: 'lowercase' as const,
    color: theme.colors.textTertiary,
  },
  qualityValue: {
    fontFamily: theme.fontFamily.display,
    fontSize: 20,
    letterSpacing: -0.5,
    color: theme.colors.text,
  },
  floatingLivePill: {
    position: 'absolute' as const,
    top: 52,
    left: 14,
    zIndex: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.successBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,204,102,0.15)',
  },
  livePillDot: {
    width: 5,
    height: 5,
    borderRadius: 9999,
    backgroundColor: theme.colors.success,
  },
  livePillText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 10,
    color: theme.colors.success,
    textTransform: 'lowercase' as const,
  },
  floatingResPill: {
    position: 'absolute' as const,
    top: 52,
    right: 14,
    zIndex: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  resPillText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'lowercase' as const,
  },
}));
