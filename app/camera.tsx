import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/components/useColorScheme';
import { LocalVideoView } from '@/src/components/video';
import { QRCodeDisplay } from '@/src/components/pairing';
import { ConnectionStatus, HotspotCredentialsForm } from '@/src/components/connection';
import type { HotspotCredentials } from '@/src/components/connection';
import { Button } from '@/src/components/ui';
import { useLocalMediaStream } from '@/src/hooks/use-local-media-stream';
import { useSignaling } from '@/src/hooks/use-signaling';
import { useWebRTCConnection } from '@/src/hooks/use-webrtc-connection';
import { useConnectionQuality } from '@/src/hooks/use-connection-quality';
import { encodeQRPayload } from '@/src/services/discovery/qr-payload';
import { formatRoomCode } from '@/src/utils';
import type { ConnectionStep, ConnectionMode } from '@/src/types';

const STORAGE_KEY_CONNECTION_MODE = '@swinglink/connection_mode';

export default function CameraScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [connectionStep, setConnectionStep] = useState<ConnectionStep>('idle');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('auto');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [hotspotCredentials, setHotspotCredentials] = useState<HotspotCredentials | null>(null);
  const [showCredentialsForm, setShowCredentialsForm] = useState(false);

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

  // Load connection mode setting
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedMode = await AsyncStorage.getItem(STORAGE_KEY_CONNECTION_MODE);
        if (savedMode === 'hotspot') {
          setConnectionMode('hotspot');
          setShowCredentialsForm(true);
        }
      } catch (error) {
        console.error('Failed to load connection mode:', error);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  // QR code payload - changes based on connection mode
  const qrPayload = roomCode
    ? encodeQRPayload({
        sessionId: roomCode,
        mode: connectionMode,
        signalingUrl: 'https://swinglink-signaling.fly.dev',
        ...(connectionMode === 'hotspot' && hotspotCredentials ? {
          hotspotSsid: hotspotCredentials.ssid,
          hotspotPassword: hotspotCredentials.password,
        } : {}),
      })
    : null;

  // Start camera and connection - but wait for settings if in hotspot mode
  useEffect(() => {
    if (isLoadingSettings) return;

    // In hotspot mode, wait for credentials before initializing
    if (connectionMode === 'hotspot' && !hotspotCredentials) return;

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
  }, [isLoadingSettings, connectionMode, hotspotCredentials]);

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

  const handleHotspotCredentialsSubmit = useCallback((credentials: HotspotCredentials) => {
    setHotspotCredentials(credentials);
    setShowCredentialsForm(false);
  }, []);

  const handleCancelHotspot = useCallback(async () => {
    // Switch to auto mode
    setConnectionMode('auto');
    setShowCredentialsForm(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_CONNECTION_MODE, 'auto');
    } catch (error) {
      console.error('Failed to save connection mode:', error);
    }
  }, []);

  const styles = createStyles(isDark);

  // Show hotspot credentials form if needed
  if (showCredentialsForm && connectionMode === 'hotspot') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.formContainer}>
          <HotspotCredentialsForm
            onSubmit={handleHotspotCredentialsSubmit}
            onCancel={handleCancelHotspot}
            isDark={isDark}
          />
        </View>
      </SafeAreaView>
    );
  }

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
        {connectionMode === 'hotspot' && hotspotCredentials && (
          <View style={[styles.modeIndicator, isDark && styles.modeIndicatorDark]}>
            <Text style={[styles.modeIndicatorText, isDark && styles.modeIndicatorTextDark]}>
              Hotspot: {hotspotCredentials.ssid}
            </Text>
          </View>
        )}
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
              {isLoadingSettings ? 'Loading settings...' : 'Generating QR code...'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      {!isConnected && connectionMode === 'auto' && connectionStep === 'displaying-qr' && (
        <View style={styles.actions}>
          <Button
            title="Use Hotspot Instead"
            onPress={() => setShowCredentialsForm(true)}
            variant="outline"
            icon="phone-portrait"
            isDark={isDark}
          />
        </View>
      )}
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
    formContainer: {
      flex: 1,
      justifyContent: 'center',
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
    modeIndicator: {
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: '#e8f5e9',
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    modeIndicatorDark: {
      backgroundColor: '#1a3a1a',
    },
    modeIndicatorText: {
      fontSize: 12,
      color: '#4CAF50',
      fontWeight: '500',
    },
    modeIndicatorTextDark: {
      color: '#4CAF50',
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
    actions: {
      marginTop: 16,
    },
  });
