import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">SwingLink</Text>
        <Text style={styles.subtitle}>P2P Golf Swing Analysis</Text>
      </View>

      <View style={styles.roleSection}>
        <Text style={styles.sectionTitle}>Select Your Role</Text>

        <Link href="/camera" asChild>
          <Pressable
            style={styles.roleButton}
            accessibilityRole="button"
            accessibilityLabel="Camera mode"
            accessibilityHint="Film the swing and stream to another device"
          >
            <View style={styles.roleIconContainer}>
              <Ionicons name="videocam" size={40} color={theme.colors.primary} />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>Camera</Text>
              <Text style={styles.roleDescription}>
                Film the swing and stream to another device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </Link>

        <Link href="/viewer" asChild>
          <Pressable
            style={styles.roleButton}
            accessibilityRole="button"
            accessibilityLabel="Viewer mode"
            accessibilityHint="Watch the swing stream from another device"
          >
            <View style={styles.roleIconContainer}>
              <Ionicons name="eye" size={40} color={theme.colors.secondary} />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>Viewer</Text>
              <Text style={styles.roleDescription}>
                Watch the swing stream from another device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </Link>

        <Link href="/clips" asChild>
          <Pressable
            style={styles.roleButton}
            accessibilityRole="button"
            accessibilityLabel="My Clips"
            accessibilityHint="View and playback recorded swing videos"
          >
            <View style={[styles.roleIconContainer, styles.clipsIconContainer]}>
              <Ionicons name="film" size={40} color={theme.palette.amber600} />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>My Clips</Text>
              <Text style={styles.roleDescription}>
                View and playback recorded swing videos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.footer}>
        <Link href="/settings" asChild>
          <Pressable
            style={styles.settingsButton}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Open app settings"
          >
            <Ionicons name="settings-outline" size={24} color={theme.colors.textSecondary} />
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.xl,
  },
  header: {
    alignItems: 'center' as const,
    marginTop: 40,
    marginBottom: 60,
  },
  title: {
    fontSize: 36,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  roleSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: theme.spacing.lg,
  },
  roleButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
    shadowOpacity: theme.isDark ? 0.3 : 0.1,
  },
  roleIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing.lg,
  },
  clipsIconContainer: {
    backgroundColor: theme.isDark ? '#2a1a1a' : theme.palette.amber50,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center' as const,
    paddingBottom: theme.spacing.xl,
  },
  settingsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: theme.spacing.md,
  },
  settingsText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
}));
