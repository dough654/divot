import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { Card } from '@/src/components/ui';
import type { Theme } from '@/src/context';

export default function SettingsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <Card padding="lg" style={styles.infoCard}>
          <Text style={styles.appName}>SwingLink</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            P2P video streaming for golfers. One device films, the other views in real-time.
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tips</Text>

        <Card style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="flash" size={20} color={theme.palette.amber600} />
            <Text style={styles.tipTitle}>Best Performance</Text>
          </View>
          <Text style={styles.tipText}>
            For the lowest latency, have the camera device enable its mobile hotspot and connect
            the viewer device to it. This creates a direct connection without going through a
            WiFi router.
          </Text>
        </Card>

        <Card style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="wifi" size={20} color={theme.colors.primary} />
            <Text style={styles.tipTitle}>Same Network</Text>
          </View>
          <Text style={styles.tipText}>
            Both devices need to be on the same WiFi network (or hotspot) to establish
            a connection. The app uses peer-to-peer streaming - no video goes to the cloud.
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.xl,
  },
  section: {
    marginBottom: theme.spacing['3xl'],
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  infoCard: {
    alignItems: 'center' as const,
  },
  appName: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  version: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  tipCard: {
    marginBottom: theme.spacing.md,
  },
  tipHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: theme.spacing.sm,
  },
  tipTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
  },
  tipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
}));
