import { View, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type QRCodeDisplayProps = {
  value: string;
  size?: number;
  roomCode?: string;
};

/**
 * Displays a QR code for device pairing.
 * Shows the room code below the QR for manual entry.
 */
export const QRCodeDisplay = ({
  value,
  size = 200,
  roomCode,
}: QRCodeDisplayProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.qrContainer}>
        <QRCode
          value={value}
          size={size}
          backgroundColor="#ffffff"
          color="#000000"
          quietZone={10}
        />
      </View>

      {roomCode && (
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>
            Room Code
          </Text>
          <Text style={styles.code}>
            {roomCode}
          </Text>
        </View>
      )}

      <Text style={styles.instruction}>
        Scan QR code or enter code manually on viewer
      </Text>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    padding: theme.spacing['2xl'],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
  },
  qrContainer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.palette.white,
    borderRadius: theme.borderRadius.md,
  },
  codeContainer: {
    marginTop: theme.spacing.xl,
    alignItems: 'center' as const,
  },
  codeLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
  },
  code: {
    fontSize: 28,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 4,
    fontFamily: 'SpaceMono',
  },
  instruction: {
    marginTop: theme.spacing.lg,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
}));
