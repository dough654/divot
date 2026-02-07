import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/context";
import { useThemedStyles, makeThemedStyles, useOrientation } from "@/src/hooks";
import type { Theme } from "@/src/context";

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { isLandscape } = useOrientation();

  const strips = [
    {
      href: "/camera" as const,
      icon: "videocam" as const,
      title: "CAMERA",
      description: "film & stream",
      label: "Camera mode",
      hint: "Film the swing and stream to another device",
      active: true,
    },
    {
      href: "/viewer" as const,
      icon: "eye" as const,
      title: "VIEWER",
      description: "watch the stream",
      label: "Viewer mode",
      hint: "Watch the swing stream from another device",
      active: false,
    },
    {
      href: "/clips" as const,
      icon: "film" as const,
      title: "MY CLIPS",
      description: "review swings",
      label: "My Clips",
      hint: "View and playback recorded swing videos",
      active: false,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.topBar}>
        <Text style={styles.brandMark}>
          Swing<Text style={styles.brandAccent}>link</Text>
        </Text>
        <Text style={styles.versionText}>v1.0</Text>
      </View>

      <View style={isLandscape ? styles.stripsLandscape : styles.strips}>
        {strips.map((strip) => (
          <Link key={strip.href} href={strip.href} asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.strip,
                strip.active && styles.stripActive,
                strip.active && styles.stripPressed,
              ])}
              android_ripple={
                Platform.OS === "android"
                  ? { color: theme.colors.accentDim }
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel={strip.label}
              accessibilityHint={strip.hint}
            >
              <Ionicons
                name={strip.icon}
                size={32}
                color={
                  strip.active ? theme.colors.accent : theme.colors.textTertiary
                }
                style={styles.stripIcon}
              />
              <View style={styles.stripBody}>
                <Text style={styles.stripTitle}>{strip.title}</Text>
                <Text style={styles.stripDescription}>{strip.description}</Text>
              </View>
              <Text style={styles.stripArrow}>→</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.bottomBar}>
        <Link href="/settings" asChild>
          <Pressable
            style={StyleSheet.flatten(styles.settingsLink)}
            android_ripple={
              Platform.OS === "android"
                ? { color: theme.colors.accentDim }
                : undefined
            }
            accessibilityRole="button"
            accessibilityLabel="Settings"
            accessibilityHint="Open app settings"
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.settingsText}>Settings</Text>
            <Text style={styles.settingsArrow}>→</Text>
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
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "baseline" as const,
    paddingHorizontal: 4,
    paddingTop: theme.spacing.xs,
  },
  brandMark: {
    fontFamily: theme.fontFamily.display,
    fontSize: 56,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  brandAccent: {
    color: theme.colors.accent,
  },
  versionText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  strips: {
    flex: 1,
    justifyContent: "center" as const,
    gap: 8,
  },
  stripsLandscape: {
    flex: 1,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: theme.spacing.sm,
  },
  strip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  stripActive: {
    borderBottomColor: theme.palette.transparent,
    borderRadius: theme.borderRadius.lg,
  },
  stripPressed: {
    backgroundColor: theme.colors.accentDim,
  },
  stripIcon: {
    width: 32,
    opacity: 0.7,
  },
  stripBody: {
    flex: 1,
  },
  stripTitle: {
    fontFamily: theme.fontFamily.display,
    fontSize: 30,
    color: theme.colors.text,
    textTransform: "uppercase" as const,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  stripDescription: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: "lowercase" as const,
    marginTop: 4,
  },
  stripArrow: {
    fontFamily: theme.fontFamily.body,
    fontSize: 22,
    color: theme.colors.accent,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  settingsLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: theme.spacing.lg,
  },
  settingsText: {
    flex: 1,
    fontFamily: theme.fontFamily.body,
    fontSize: 17,
    color: theme.colors.textSecondary,
  },
  settingsArrow: {
    fontFamily: theme.fontFamily.body,
    fontSize: 18,
    color: theme.colors.textTertiary,
  },
}));
