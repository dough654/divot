import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '../../hooks';
import type { Theme } from '../../context';

export type QRCodeScannerProps = {
  onScan: (data: string) => void;
  isScanning?: boolean;
};

/**
 * QR code scanner for reading pairing codes.
 * Uses VisionCamera with MLKit (Android) / AVFoundation (iOS) for reliable barcode detection.
 */
export const QRCodeScanner = ({
  onScan,
  isScanning = true,
}: QRCodeScannerProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const haptics = useHaptics();
  const hasTriggeredRef = useRef(false);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: useCallback((codes, frame) => {
      console.log('[QRScanner] onCodeScanned fired — codes:', codes.length, 'frame:', frame.width, 'x', frame.height);
      if (codes.length > 0) {
        console.log('[QRScanner] Code[0]:', JSON.stringify(codes[0]));
      }
      if (!isScanning) return;
      const firstCode = codes[0];
      if (firstCode?.value) {
        // Haptic feedback on successful scan (only once per scan session)
        if (!hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          haptics.success();
        }
        onScan(firstCode.value);
      }
    }, [isScanning, onScan, haptics]),
  });

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="camera-outline" size={48} color={theme.colors.textSecondary} />
        <Text style={styles.message}>
          Camera permission is required to scan QR codes
        </Text>
        <Pressable
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="Grant Permission"
          accessibilityHint="Allow camera access to scan QR codes"
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.message}>
          No camera device available
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={absoluteFillStyle.camera}
        device={device}
        isActive={isScanning}
        codeScanner={codeScanner}
        androidPreviewViewType="texture-view"
        onError={(error) => console.error('[QRScanner] Camera error:', error.code, error.message)}
      />
      <View style={absoluteFillStyle.overlay} pointerEvents="none">
        <View style={styles.scanArea}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.instruction}>
          {isScanning ? 'Point at QR code to scan' : 'Processing...'}
        </Text>
      </View>
    </View>
  );
};

const CORNER_SIZE = 30;
const CORNER_THICKNESS = 4;

// These styles need absolute positioning which doesn't work well with themed styles
const absoluteFillStyle = StyleSheet.create({
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.palette.black,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden' as const,
  },
  centered: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing['2xl'],
    backgroundColor: theme.colors.backgroundTertiary,
  },
  scanArea: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute' as const,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: theme.colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  instruction: {
    marginTop: theme.spacing['2xl'],
    fontSize: theme.fontSize.md,
    color: theme.palette.white,
    textAlign: 'center' as const,
  },
  message: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  permissionButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing['2xl'],
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
  },
  permissionButtonText: {
    color: theme.palette.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
}));
