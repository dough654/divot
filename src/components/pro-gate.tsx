/**
 * ProGate — Reusable gating component for Pro features.
 *
 * Renders children when the user is Pro, otherwise shows
 * a lock prompt with an upgrade button.
 */
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';

import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import type { Theme } from '@/src/context';

type ProGateProps = {
  /** Whether the user has an active Pro subscription. */
  isPro: boolean;
  /** Display name for the gated feature. */
  featureName: string;
  /** Optional short description of the feature. */
  featureDescription?: string;
  children: ReactNode;
};

export const ProGate = ({ isPro, featureName, featureDescription, children }: ProGateProps) => {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const haptics = useHaptics();

  if (isPro) {
    return <>{children}</>;
  }

  const handleUpgrade = () => {
    haptics.light();
    router.push('/paywall');
  };

  return (
    <View style={styles.container}>
      <Ionicons name="lock-closed" size={32} color={styles.lockIcon.color} />
      <Text style={styles.featureName}>{featureName}</Text>
      {featureDescription ? (
        <Text style={styles.featureDescription}>{featureDescription}</Text>
      ) : null}
      <Pressable
        style={styles.upgradeButton}
        onPress={handleUpgrade}
        accessibilityRole="button"
        accessibilityLabel={`Upgrade to Pro to unlock ${featureName}`}
      >
        <Text style={styles.upgradeButtonText}>UPGRADE TO PRO</Text>
      </Pressable>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
  },
  lockIcon: {
    color: theme.colors.accent,
  },
  featureName: {
    fontFamily: theme.fontFamily.display,
    fontSize: 22,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
    marginTop: theme.spacing.md,
  },
  featureDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  upgradeButton: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.accent,
  },
  upgradeButtonText: {
    fontFamily: theme.fontFamily.display,
    fontSize: 18,
    color: theme.isDark ? theme.palette.black : theme.palette.white,
    letterSpacing: -0.3,
  },
}));
