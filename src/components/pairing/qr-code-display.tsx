import { View, Text } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type QRCodeDisplayProps = {
  value: string;
  size?: number;
  roomCode?: string;
  /** Tighter spacing for constrained layouts (e.g. landscape modal). */
  compact?: boolean;
};

/**
 * Displays a QR code for device pairing.
 * Shows the room code below the QR for manual entry.
 */
export const QRCodeDisplay = ({
  value,
  size = 200,
  roomCode,
  compact = false,
}: QRCodeDisplayProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={[styles.qrContainer, compact && styles.qrContainerCompact]}>
        <QRCode
          value={value}
          size={size}
          backgroundColor="#ffffff"
          color="#000000"
          quietZone={compact ? 4 : 10}
        />
      </View>

      {roomCode && (
        <View style={[styles.codeContainer, compact && styles.codeContainerCompact]}>
          <Text style={styles.codeLabel}>
            Room Code
          </Text>
          <Text style={[styles.code, compact && styles.codeCompact]}>
            {roomCode}
          </Text>
        </View>
      )}

      <Text style={[styles.instruction, compact && styles.instructionCompact]}>
        {compact ? 'Scan or enter code on viewer' : 'Scan QR code or enter code manually on viewer'}
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
  containerCompact: {
    padding: theme.spacing.md,
  },
  qrContainer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.palette.white,
    borderRadius: theme.borderRadius.md,
  },
  qrContainerCompact: {
    padding: theme.spacing.sm,
  },
  codeContainer: {
    marginTop: theme.spacing.xl,
    alignItems: 'center' as const,
  },
  codeContainerCompact: {
    marginTop: theme.spacing.sm,
  },
  codeLabel: {
    fontFamily: theme.fontFamily.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
    marginBottom: 4,
  },
  code: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 28,
    color: theme.colors.text,
    letterSpacing: 4,
  },
  codeCompact: {
    fontSize: 22,
    letterSpacing: 3,
  },
  instruction: {
    fontFamily: theme.fontFamily.body,
    marginTop: theme.spacing.lg,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    textTransform: 'lowercase' as const,
  },
  instructionCompact: {
    marginTop: theme.spacing.xs,
    fontSize: 10,
  },
}));
