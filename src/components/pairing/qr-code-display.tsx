import { StyleSheet, View, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export type QRCodeDisplayProps = {
  value: string;
  size?: number;
  roomCode?: string;
  isDark?: boolean;
};

/**
 * Displays a QR code for device pairing.
 * Shows the room code below the QR for manual entry.
 */
export const QRCodeDisplay = ({
  value,
  size = 200,
  roomCode,
  isDark = false,
}: QRCodeDisplayProps) => {
  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.qrContainer}>
        <QRCode
          value={value}
          size={size}
          backgroundColor={isDark ? '#2a2a4e' : '#ffffff'}
          color={isDark ? '#ffffff' : '#1a1a2e'}
        />
      </View>

      {roomCode && (
        <View style={styles.codeContainer}>
          <Text style={[styles.codeLabel, isDark && styles.codeLabelDark]}>
            Room Code
          </Text>
          <Text style={[styles.code, isDark && styles.codeDark]}>
            {roomCode}
          </Text>
        </View>
      )}

      <Text style={[styles.instruction, isDark && styles.instructionDark]}>
        Scan QR code or enter code manually on viewer
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  containerDark: {
    backgroundColor: '#2a2a4e',
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  codeContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeLabelDark: {
    color: '#888',
  },
  code: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: 4,
    fontFamily: 'SpaceMono',
  },
  codeDark: {
    color: '#ffffff',
  },
  instruction: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  instructionDark: {
    color: '#888',
  },
});
