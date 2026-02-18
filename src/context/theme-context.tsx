/**
 * Divot Theme Context
 *
 * Provides theme-aware styling throughout the app. Components automatically
 * adapt to light/dark mode without prop drilling.
 *
 * ## Migration Guide
 *
 * ### Before (prop drilling):
 * ```tsx
 * // Parent
 * const isDark = useColorScheme() === 'dark';
 * <Button isDark={isDark} />
 *
 * // Component
 * const Button = ({ isDark }: { isDark: boolean }) => {
 *   const bg = isDark ? '#2a2a4e' : '#f0f0f0';
 *   return <View style={{ backgroundColor: bg }} />;
 * };
 * ```
 *
 * ### After (useTheme):
 * ```tsx
 * // Component (no props needed)
 * const Button = () => {
 *   const { theme } = useTheme();
 *   return <View style={{ backgroundColor: theme.colors.surface }} />;
 * };
 * ```
 *
 * ### Using useThemedStyles for StyleSheets:
 * ```tsx
 * const createStyles = makeThemedStyles((theme) => ({
 *   container: { backgroundColor: theme.colors.background },
 * }));
 *
 * const MyComponent = () => {
 *   const styles = useThemedStyles(createStyles);
 *   return <View style={styles.container} />;
 * };
 * ```
 */
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { colors, palette, fontFamily, spacing, borderRadius, fontSize, fontWeight, lineHeight, shadows, opacity, animation } from '../constants/design-tokens';
import type { ColorScheme, ThemeColors } from '../constants/design-tokens';

// ============================================
// THEME TYPE
// ============================================

export type Theme = {
  colors: ThemeColors;
  palette: typeof palette;
  fontFamily: typeof fontFamily;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  lineHeight: typeof lineHeight;
  shadows: typeof shadows;
  opacity: typeof opacity;
  animation: typeof animation;
  isDark: boolean;
};

// ============================================
// CONTEXT TYPE
// ============================================

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme | 'system') => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================
// THEME BUILDER
// ============================================

const buildTheme = (colorScheme: ColorScheme): Theme => ({
  colors: colors[colorScheme],
  palette,
  fontFamily,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  lineHeight,
  shadows,
  opacity,
  animation,
  isDark: colorScheme === 'dark',
});

// ============================================
// PROVIDER
// ============================================

type ThemeProviderProps = {
  children: ReactNode;
  /** External theme mode override (from settings). If provided, overrides internal state. */
  themeMode?: ColorScheme | 'system';
  /** Callback when theme mode changes. Used to sync with settings. */
  onThemeModeChange?: (mode: ColorScheme | 'system') => void;
};

/**
 * Provides theme context to the app with system color scheme detection
 * and manual override capability.
 */
export const AppThemeProvider = ({
  children,
  themeMode: externalThemeMode,
  onThemeModeChange,
}: ThemeProviderProps) => {
  const systemColorScheme = useSystemColorScheme();
  const [internalScheme, setInternalScheme] = useState<ColorScheme | 'system'>('system');

  // Use external theme mode if provided, otherwise use internal state
  const manualScheme = externalThemeMode ?? internalScheme;

  const colorScheme: ColorScheme = useMemo(() => {
    if (manualScheme === 'system') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return manualScheme;
  }, [manualScheme, systemColorScheme]);

  const theme = useMemo(() => buildTheme(colorScheme), [colorScheme]);

  const setColorScheme = useCallback((scheme: ColorScheme | 'system') => {
    if (onThemeModeChange) {
      onThemeModeChange(scheme);
    } else {
      setInternalScheme(scheme);
    }
  }, [onThemeModeChange]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme.isDark,
      colorScheme,
      setColorScheme,
    }),
    [theme, colorScheme, setColorScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// ============================================
// HOOK
// ============================================

/**
 * Access the current theme and theme controls.
 *
 * @returns Theme object, isDark boolean, and setColorScheme function
 * @throws Error if used outside of AppThemeProvider
 *
 * @example
 * const { theme, isDark, setColorScheme } = useTheme();
 * // Use theme.colors.primary, theme.spacing.md, etc.
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within an AppThemeProvider');
  }
  return context;
};

/**
 * Access just the theme object (convenience hook).
 *
 * @returns The current theme object
 */
export const useThemeColors = (): ThemeColors => {
  const { theme } = useTheme();
  return theme.colors;
};
