import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PurchasesPackage } from 'react-native-purchases';

import { useTheme, useSubscription, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import type { Theme } from '@/src/context';

// ============================================
// FEATURE LISTS
// ============================================

type FeatureItem = {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  description: string;
};

const PRO_FEATURES: FeatureItem[] = [
  { icon: 'cloud-upload-outline', name: 'Cloud Backup', description: 'Back up clips to the cloud' },
  { icon: 'speedometer-outline', name: 'Swing Tempo', description: 'Measure backswing/downswing ratio' },
  { icon: 'body-outline', name: 'Pose Overlay', description: 'Skeleton overlay on playback' },
  { icon: 'git-compare-outline', name: 'Side-by-Side', description: 'Compare two swings together' },
  { icon: 'people-outline', name: 'Ghost Overlay', description: 'Overlay a reference swing' },
  { icon: 'videocam-off-outline', name: 'Watermark-Free Export', description: 'Export clips without watermark' },
];

const FREE_FEATURES: FeatureItem[] = [
  { icon: 'videocam-outline', name: 'Recording', description: 'Record your swing in up to 240fps' },
  { icon: 'wifi-outline', name: 'P2P Streaming', description: 'Stream live to a second device' },
  { icon: 'play-outline', name: 'Playback', description: 'Slow-motion review with scrubbing' },
  { icon: 'pencil-outline', name: 'Annotations', description: 'Draw lines and angles on video' },
  { icon: 'calendar-outline', name: 'Sessions', description: 'Organize clips by practice session' },
  { icon: 'download-outline', name: 'Video Export', description: 'Export clips with divot watermark' },
];

export default function PaywallScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const haptics = useHaptics();
  const { show: showToast } = useToast();
  const { isPro, isLoading, currentOffering, purchasePackage, restorePurchases } = useSubscription();

  const handlePurchase = async (pkg: PurchasesPackage) => {
    haptics.light();
    const success = await purchasePackage(pkg);
    if (success) {
      haptics.success();
      showToast('Welcome to Divot Pro!', { variant: 'success' });
      router.back();
    }
  };

  const handleRestore = async () => {
    haptics.light();
    const restored = await restorePurchases();
    if (restored) {
      haptics.success();
      showToast('Purchases restored', { variant: 'success' });
      router.back();
    } else {
      showToast('No purchases to restore', { variant: 'info' });
    }
  };

  // Already subscribed view
  if (isPro) {
    return (
      <View style={[styles.container, styles.centeredContainer]}>
        <View style={styles.proConfirmation}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.accent} />
          <Text style={styles.heroTitle}>DIVOT PRO</Text>
          <Text style={styles.proConfirmationText}>You have full access to all Pro features.</Text>
        </View>
      </View>
    );
  }

  const packages = currentOffering?.availablePackages ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>DIVOT PRO</Text>
        <Text style={styles.heroSubtitle}>unlock your full potential</Text>
      </View>

      {/* Pro Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>pro features</Text>
        {PRO_FEATURES.map((feature) => (
          <View key={feature.name} style={styles.featureRow}>
            <View style={styles.featureIconContainer}>
              <Ionicons name={feature.icon} size={20} color={theme.colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureName}>{feature.name}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Free Features */}
      <View style={styles.section}>
        <Text style={styles.sectionTitleFree}>always free</Text>
        {FREE_FEATURES.map((feature) => (
          <View key={feature.name} style={styles.featureRow}>
            <View style={styles.featureIconContainerFree}>
              <Ionicons name={feature.icon} size={20} color={theme.colors.textTertiary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureName}>{feature.name}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Package Cards */}
      <View style={styles.section}>
        {packages.length > 0 ? (
          packages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              style={styles.packageCard}
              onPress={() => handlePurchase(pkg)}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={`Subscribe to ${pkg.product.title} for ${pkg.product.priceString}`}
            >
              <Text style={styles.packageTitle}>{pkg.product.title}</Text>
              <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
              {pkg.product.description ? (
                <Text style={styles.packageDescription}>{pkg.product.description}</Text>
              ) : null}
            </Pressable>
          ))
        ) : (
          <View style={styles.unavailableCard}>
            <Ionicons name="time-outline" size={24} color={theme.colors.textTertiary} />
            <Text style={styles.unavailableText}>subscriptions not yet available</Text>
            <Text style={styles.unavailableSubtext}>check back soon</Text>
          </View>
        )}

        {isLoading && (
          <ActivityIndicator
            size="small"
            color={theme.colors.accent}
            style={styles.loadingIndicator}
          />
        )}
      </View>

      {/* Restore */}
      <Pressable
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Restore previous purchases"
      >
        <Text style={styles.restoreText}>restore purchases</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centeredContainer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  contentContainer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },

  // Hero
  hero: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing['2xl'],
    paddingTop: theme.spacing.lg,
  },
  heroTitle: {
    fontFamily: theme.fontFamily.display,
    fontSize: 42,
    color: theme.colors.accent,
    letterSpacing: -1,
    textTransform: 'uppercase' as const,
  },
  heroSubtitle: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 4,
  },

  // Sections
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.accent,
    textTransform: 'lowercase' as const,
    marginBottom: theme.spacing.md,
  },
  sectionTitleFree: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginBottom: theme.spacing.md,
  },

  // Feature rows
  featureRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.accentDim,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing.md,
  },
  featureIconContainerFree: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing.md,
  },
  featureText: {
    flex: 1,
  },
  featureName: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: 16,
    color: theme.colors.text,
  },
  featureDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },

  // Package cards
  packageCard: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    alignItems: 'center' as const,
  },
  packageTitle: {
    fontFamily: theme.fontFamily.display,
    fontSize: 22,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
  },
  packagePrice: {
    fontFamily: theme.fontFamily.bodyBold,
    fontSize: 28,
    color: theme.colors.accent,
    marginTop: 4,
  },
  packageDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: 4,
    textAlign: 'center' as const,
  },

  // Unavailable state
  unavailableCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    alignItems: 'center' as const,
  },
  unavailableText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
    marginTop: theme.spacing.sm,
  },
  unavailableSubtext: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 4,
  },

  // Loading
  loadingIndicator: {
    marginTop: theme.spacing.md,
  },

  // Restore button
  restoreButton: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.md,
  },
  restoreText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    textDecorationLine: 'underline' as const,
  },

  // Pro confirmation
  proConfirmation: {
    alignItems: 'center' as const,
    padding: theme.spacing['2xl'],
  },
  proConfirmationText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
    marginTop: theme.spacing.md,
    textAlign: 'center' as const,
  },
}));
