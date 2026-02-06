import { View, Text, Pressable, GestureResponderEvent, Platform } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { forwardRef } from 'react';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, usePressAnimation, useOrientation } from '@/src/hooks';
import type { Theme } from '@/src/context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StripButtonProps = {
  children: React.ReactNode;
  style: object;
  pressedBgColor: string;
  defaultBgColor: string;
  rippleColor?: string;
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress?: (e: GestureResponderEvent) => void;
};

/**
 * Animated strip button with scale and color feedback on press.
 * Forwards ref for use with Link asChild.
 */
const StripButton = forwardRef<View, StripButtonProps>(
  ({ children, style, pressedBgColor, defaultBgColor, rippleColor, ...props }, ref) => {
    const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation({
      defaultColor: defaultBgColor,
      pressedColor: pressedBgColor,
    });

    return (
      <AnimatedPressable
        ref={ref}
        style={[style, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={Platform.OS === 'android' ? { color: rippleColor || 'rgba(0, 0, 0, 0.1)' } : undefined}
        {...props}
      >
        {children}
      </AnimatedPressable>
    );
  }
);

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { isLandscape } = useOrientation();

  const strips = [
    {
      href: '/camera' as const,
      icon: 'videocam' as const,
      title: 'CAMERA',
      description: 'film & stream',
      label: 'Camera mode',
      hint: 'Film the swing and stream to another device',
      active: true,
    },
    {
      href: '/viewer' as const,
      icon: 'eye' as const,
      title: 'VIEWER',
      description: 'watch the stream',
      label: 'Viewer mode',
      hint: 'Watch the swing stream from another device',
      active: false,
    },
    {
      href: '/clips' as const,
      icon: 'film' as const,
      title: 'MY CLIPS',
      description: 'review swings',
      label: 'My Clips',
      hint: 'View and playback recorded swing videos',
      active: false,
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.brandMark}>swinglink</Text>
        <Text style={styles.versionText}>v1.0</Text>
      </View>

      <View style={isLandscape ? styles.stripsLandscape : styles.strips}>
        {strips.map((strip) => (
          <Link key={strip.href} href={strip.href} asChild>
            <StripButton
              style={[styles.strip, strip.active && styles.stripActive]}
              defaultBgColor={strip.active ? theme.colors.accentDim : theme.palette.transparent}
              pressedBgColor={theme.colors.accentDim}
              rippleColor={theme.colors.accentDim}
              accessibilityRole="button"
              accessibilityLabel={strip.label}
              accessibilityHint={strip.hint}
            >
              <Ionicons
                name={strip.icon}
                size={28}
                color={strip.active ? theme.colors.accent : theme.colors.textTertiary}
                style={styles.stripIcon}
              />
              <View style={styles.stripBody}>
                <Text style={styles.stripTitle}>{strip.title}</Text>
                <Text style={styles.stripDescription}>{strip.description}</Text>
              </View>
              <Text style={styles.stripArrow}>→</Text>
            </StripButton>
          </Link>
        ))}
      </View>

      <View style={styles.bottomBar}>
        <Link href="/settings" asChild>
          <Pressable
            style={styles.settingsLink}
            android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim, borderless: true } : undefined}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Open app settings"
          >
            <Text style={styles.settingsText}>settings →</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
  },
  topBar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    paddingHorizontal: 4,
    paddingTop: theme.spacing.xs,
  },
  brandMark: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 9,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  versionText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 8,
    color: theme.colors.textTertiary,
  },
  strips: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: 6,
  },
  stripsLandscape: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: theme.spacing.sm,
  },
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  stripActive: {
    borderBottomColor: theme.palette.transparent,
    borderRadius: theme.borderRadius.lg,
  },
  stripIcon: {
    width: 28,
    opacity: 0.7,
  },
  stripBody: {
    flex: 1,
  },
  stripTitle: {
    fontFamily: theme.fontFamily.display,
    fontSize: 24,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  stripDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 9,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 4,
  },
  stripArrow: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.accent,
  },
  bottomBar: {
    paddingVertical: theme.spacing.md,
    alignItems: 'flex-end' as const,
  },
  settingsLink: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  settingsText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 9,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
}));
