import { View, Text, Pressable, Alert, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useTheme } from '@/src/context';
import type { Theme } from '@/src/context';
import { RemoteVideoView } from '@/src/components/video';
import { QRCodeScanner, ManualCodeEntry, NearbyDevices, NoInternetCard } from '@/src/components/pairing';
import { ConnectionStatus } from '@/src/components/connection';
import { TransferProgressModal } from '@/src/components/clip-sync';
import { ErrorDetail } from '@/src/components/ui';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { useClipSync } from '@/src/hooks/use-clip-sync';
import { useAutoReconnect } from '@/src/hooks/use-auto-reconnect';
import { useBLEScanning } from '@/src/hooks/use-ble-discovery';
import { useConnectivity } from '@/src/hooks/use-connectivity';
import { useAutoConnect } from '@/src/hooks/use-auto-connect';
import { decodeQRPayload, isValidSwingLinkQR } from '@/src/services/discovery/qr-payload';
import { connectionErrors, getSignalingError } from '@/src/utils/error-messages';
import { shouldBlockConnection } from '@/src/utils/connectivity';
import type { ConnectionStep } from '@/src/types';
import type { Clip } from '@/src/types/recording';
import type { DiscoveredDevice } from '@/modules/swinglink-ble';
import type { RecoveryAction } from '@/src/utils/error-messages';

export default function ViewerScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('scanning-qr');
  const [isScanning, setIsScanning] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [connectionErrorCode, setConnectionErrorCode] = useState<string | null>(null);
  const isProcessingScan = useRef(false);

  const roomCodeRef = useRef<string | null>(null);
  const [wasConnected, setWasConnected] = useState(false);
  const [blockedDevice, setBlockedDevice] = useState<DiscoveredDevice | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [serverReady, setServerReady] = useState(false);
  const handshakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeGenerationRef = useRef(0);
  const awaitingHandshakeRef = useRef(false);
  const lastBLEDeviceRef = useRef<DiscoveredDevice | null>(null);

  // Connectivity status (GOL-68)
  const { isInternetReachable } = useConnectivity();

  // BLE scanning for nearby cameras (silently disabled if permissions denied)
  const {
    isScanning: isBLEScanning,
    devices: nearbyDevices,
  } = useBLEScanning({ enabled: isScanning && !useManualEntry });

  // Hooks
  const {
    connectionState: signalingConnectionState,
    channel,
    connect: connectSignaling,
    reconnectSignaling,
    joinRoom,
    rejoinRoom,
    requestRoom,
    onConnectionRequestResponse,
  } = useSignaling({ autoConnect: false });

  const autoConnect = useAutoConnect({
    role: 'viewer',
    roomCode: roomCodeRef.current,
    serverChannel: channel,
    serverReady,
    remotePlatform: selectedDevice?.platform,
    enabled: !!selectedDevice,
  });

  const {
    peerConnection,
    remoteStream,
    isConnected,
    dataChannel,
    status: webrtcStatus,
  } = useWebRTCConnection({
    signalingChannel: autoConnect.channel,
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

  // Auto-reconnect (viewer: restartIce/renegotiate are no-ops since camera initiates)
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
    setConnectionErrorCode(null);

    await connectSignaling();
    const joined = await joinRoom(roomCode);

    if (!joined) {
      setConnectionErrorCode('ROOM_NOT_FOUND');
      setConnectionStep('failed');
      return;
    }

    setServerReady(true);
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

    // GOL-68: block if no internet (QR/manual always need signaling server)
    if (isInternetReachable === false) {
      setConnectionErrorCode('NO_INTERNET');
      setConnectionStep('failed');
      return;
    }

    isProcessingScan.current = true;
    setIsScanning(false);

    await proceedWithConnection(payload.sessionId);
  }, [proceedWithConnection, isInternetReachable]);

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

  // Handle connection request response (BLE handshake result)
  useEffect(() => {
    const unsubscribe = onConnectionRequestResponse((response) => {
      // Only process if we're actively awaiting a handshake response.
      // This prevents stale responses (e.g. camera auto-declined from a prior
      // attempt) from being processed during a retry's async setup.
      if (!awaitingHandshakeRef.current) return;
      awaitingHandshakeRef.current = false;

      // Clear handshake timeout
      if (handshakeTimeoutRef.current) {
        clearTimeout(handshakeTimeoutRef.current);
        handshakeTimeoutRef.current = null;
      }

      if (response.accepted) {
        // Camera accepted — now join the room
        const roomCode = roomCodeRef.current;
        if (roomCode) {
          joinRoom(roomCode).then((joined) => {
            if (joined) {
              setServerReady(true);
              setConnectionStep('establishing-webrtc');
            } else {
              setConnectionErrorCode('ROOM_NOT_FOUND');
              setConnectionStep('failed');
              isProcessingScan.current = false;
            }
          });
        }
      } else {
        // Distinguish explicit decline from auto-timeout on the camera side
        const errorCode = response.reason === 'timeout' ? 'REQUEST_TIMEOUT' : 'CONNECTION_DECLINED';
        setConnectionErrorCode(errorCode);
        setConnectionStep('failed');
        isProcessingScan.current = false;
      }
    });

    return unsubscribe;
  }, [onConnectionRequestResponse, joinRoom]);

  // Clean up handshake timeout on unmount
  useEffect(() => {
    return () => {
      if (handshakeTimeoutRef.current) {
        clearTimeout(handshakeTimeoutRef.current);
      }
    };
  }, []);

  // Mirror orchestrator state into the connection step UI
  useEffect(() => {
    if (autoConnect.state === 'attempting-p2p') {
      setConnectionStep('attempting-p2p');
    } else if (autoConnect.state === 'connected-p2p') {
      setConnectionStep('establishing-webrtc');
    }
  }, [autoConnect.state]);

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
    awaitingHandshakeRef.current = false;
    handshakeGenerationRef.current++;
    lastBLEDeviceRef.current = null;
    if (handshakeTimeoutRef.current) {
      clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
    setIsScanning(true);
    setConnectionStep('scanning-qr');
    setUseManualEntry(false);
    setConnectionErrorCode(null);
    setBlockedDevice(null);
    setSelectedDevice(null);
    setServerReady(false);
  }, []);

  // Handle nearby device selection — lightweight: sets device + lets orchestrator drive
  const handleDeviceSelect = useCallback((device: DiscoveredDevice) => {
    if (isProcessingScan.current) return;

    lastBLEDeviceRef.current = device;

    // GOL-68: check connectivity for cross-platform connections
    const localPlatform = Platform.OS as 'ios' | 'android';
    if (shouldBlockConnection({ localPlatform, remotePlatform: device.platform, isInternetReachable })) {
      setBlockedDevice(device);
      return;
    }

    isProcessingScan.current = true;
    setIsScanning(false);
    setConnectionErrorCode(null);
    roomCodeRef.current = device.roomCode;
    setSelectedDevice(device);
    // connectionStep will be set by the P2P effect or the needsServerSignaling effect
  }, [isInternetReachable]);

  // Server handshake: connect signaling → requestRoom → await camera acceptance
  const initiateServerHandshake = useCallback(async (device: DiscoveredDevice) => {
    setConnectionStep('exchanging-signaling');

    // Suppress any stale responses arriving during async setup
    awaitingHandshakeRef.current = false;

    // Bump generation so any stale timeout from a prior handshake is ignored
    handshakeGenerationRef.current++;
    const generation = handshakeGenerationRef.current;

    await connectSignaling();

    // Send connection request with the *viewer's* device info (not the camera's BLE name)
    const localPlatform = Platform.OS as 'ios' | 'android';
    const androidModel = (Platform.constants as Record<string, unknown>)?.Model;
    const localDeviceName = localPlatform === 'ios' ? 'iPhone' : `Android ${typeof androidModel === 'string' ? androidModel : 'device'}`;
    const requested = await requestRoom(
      device.roomCode,
      localDeviceName,
      localPlatform,
    );

    if (!requested) {
      setConnectionErrorCode('ROOM_NOT_FOUND');
      setConnectionStep('failed');
      isProcessingScan.current = false;
      return;
    }

    setConnectionStep('awaiting-acceptance');
    awaitingHandshakeRef.current = true;

    // 30s timeout for camera to respond — only fire if still on this generation
    handshakeTimeoutRef.current = setTimeout(() => {
      if (handshakeGenerationRef.current !== generation) return;
      awaitingHandshakeRef.current = false;
      setConnectionErrorCode('REQUEST_TIMEOUT');
      setConnectionStep('failed');
      isProcessingScan.current = false;
    }, 30000);
  }, [connectSignaling, requestRoom]);

  // When P2P fails/unavailable, the orchestrator signals needs-server.
  // Kick off the BLE handshake → server signaling flow for the selected device.
  useEffect(() => {
    if (!autoConnect.needsServerSignaling || !selectedDevice) return;

    initiateServerHandshake(selectedDevice);
  }, [autoConnect.needsServerSignaling, selectedDevice, initiateServerHandshake]);

  // Handle recovery actions from ErrorDetail
  const handleErrorAction = useCallback((action: RecoveryAction['action']) => {
    switch (action) {
      case 'retry':
        if (lastBLEDeviceRef.current) {
          // P2P already failed/skipped — retry the server handshake directly
          setConnectionErrorCode(null);
          initiateServerHandshake(lastBLEDeviceRef.current);
        } else if (roomCodeRef.current) {
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
  }, [proceedWithConnection, handleRescan, initiateServerHandshake]);

  // Handle manual code entry
  const handleManualCodeSubmit = useCallback(async (code: string) => {
    if (isProcessingScan.current) return;

    // GOL-68: block if no internet
    if (isInternetReachable === false) {
      setConnectionErrorCode('NO_INTERNET');
      setConnectionStep('failed');
      return;
    }

    isProcessingScan.current = true;
    setIsScanning(false);

    await proceedWithConnection(code);
  }, [proceedWithConnection, isInternetReachable]);

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => useManualEntry ? setUseManualEntry(false) : router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={useManualEntry ? 'Go back to scanner' : 'Go back to Home'}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          <Text style={styles.backLabel}>{useManualEntry ? 'Scanner' : 'Home'}</Text>
        </Pressable>
        {!useManualEntry && (
          <ConnectionStatus step={connectionStep} quality={quality} compact />
        )}
        {isConnected && autoConnect.activeTransport && (
          <View style={[
            styles.transportBadge,
            autoConnect.activeTransport === 'p2p' ? styles.transportBadgeP2P : styles.transportBadgeServer,
          ]}>
            <Ionicons
              name={autoConnect.activeTransport === 'p2p' ? 'radio' : 'cloud-outline'}
              size={11}
              color={autoConnect.activeTransport === 'p2p' ? '#7C6BFF' : theme.colors.textTertiary}
            />
            <Text style={[
              styles.transportBadgeText,
              autoConnect.activeTransport === 'p2p' && styles.transportBadgeTextP2P,
            ]}>
              {autoConnect.activeTransport === 'p2p' ? 'P2P' : 'Server'}
            </Text>
          </View>
        )}
      </View>

      {/* Video or Scanner or Manual Entry or No Internet */}
      <View style={styles.mainContent}>
        {blockedDevice ? (
          <NoInternetCard onGoBack={handleRescan} />
        ) : isConnected ? (
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
            <View style={styles.scannerLayout}>
              <NearbyDevices
                devices={nearbyDevices}
                isScanning={isBLEScanning}
                onDeviceSelect={handleDeviceSelect}
              />
              <View style={styles.qrScannerContainer}>
                <QRCodeScanner
                  onScan={handleScan}
                  isScanning={isScanning}
                />
              </View>
            </View>
          )
        ) : (
          <View style={styles.connectingContainer}>
            <Text style={styles.connectingText}>
              Connecting to camera...
            </Text>
          </View>
        )}
      </View>

      {/* Floating manual entry pill */}
      {isScanning && !useManualEntry && (
        <Pressable
          style={[styles.manualEntryPill, { bottom: insets.bottom + 24 }]}
          onPress={() => setUseManualEntry(true)}
          accessibilityRole="button"
          accessibilityLabel="Enter code manually"
        >
          <Ionicons name="keypad-outline" size={16} color="#fff" />
          <Text style={styles.manualEntryPillText}>Enter Code</Text>
        </Pressable>
      )}

      {/* Error / Connection info bar */}
      {((connectionStep === 'failed' || connectionStep === 'reconnect-failed') && currentError || isConnected) && (
        <View style={[styles.bottomBar, { bottom: 10 + insets.bottom }]}>
          {(connectionStep === 'failed' || connectionStep === 'reconnect-failed') && currentError && (
            <ErrorDetail
              error={currentError}
              onAction={handleErrorAction}
            />
          )}

          {isConnected && (
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
      )}

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
  mainContent: {
    flex: 1,
    overflow: 'hidden' as const,
  },
  scannerLayout: {
    flex: 1,
  },
  qrScannerContainer: {
    flex: 1,
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
  manualEntryPill: {
    position: 'absolute' as const,
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  manualEntryPillText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.body,
    fontWeight: theme.fontWeight.semibold,
    color: '#fff',
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
  transportBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  transportBadgeP2P: {
    backgroundColor: 'rgba(124,107,255,0.15)',
  },
  transportBadgeServer: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  transportBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textTertiary,
  },
  transportBadgeTextP2P: {
    color: '#7C6BFF',
    fontFamily: theme.fontFamily.bodySemiBold,
  },
}));
