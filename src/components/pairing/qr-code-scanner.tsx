import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type QRCodeScannerProps = {
  onScan: (data: string) => void;
  isScanning?: boolean;
  isDark?: boolean;
};

/**
 * QR code scanner for reading pairing codes.
 * Uses VisionCamera with MLKit (Android) / AVFoundation (iOS) for reliable barcode detection.
 */
export const QRCodeScanner = ({
  onScan,
  isScanning = true,
  isDark = false,
}: QRCodeScannerProps) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

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
        onScan(firstCode.value);
      }
    }, [isScanning, onScan]),
  });

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <Ionicons name="camera-outline" size={48} color={isDark ? '#888' : '#666'} />
        <Text style={[styles.message, isDark && styles.messageDark]}>
          Camera permission is required to scan QR codes
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={[styles.message, isDark && styles.messageDark]}>
          No camera device available
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        device={device}
        isActive={isScanning}
        codeScanner={codeScanner}
        androidPreviewViewType="texture-view"
        onError={(error) => console.error('[QRScanner] Camera error:', error.code, error.message)}
      />
      <View style={styles.overlay} pointerEvents="none">
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  containerDark: {
    backgroundColor: '#1a1a2e',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#4CAF50',
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
    marginTop: 24,
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  messageDark: {
    color: '#888',
  },
  permissionButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
