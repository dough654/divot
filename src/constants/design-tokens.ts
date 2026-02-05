/**
 * SwingLink Design Tokens
 * Centralized design system constants for consistent UI.
 */

// ============================================
// COLOR PALETTE
// ============================================

/** Raw color palette - use semantic tokens in components */
export const palette = {
  // Greens (Primary)
  green50: '#e8f5e9',
  green500: '#4CAF50',
  green600: '#43A047',
  green700: '#388E3C',

  // Blues (Secondary)
  blue500: '#2196F3',
  blue600: '#1E88E5',

  // Reds (Danger/Recording)
  red400: '#ff453a', // iOS-style
  red500: '#f44336',
  red600: '#E53935',

  // Ambers (Warning)
  amber50: '#FFF8E1',
  amber300: '#FFB74D',
  amber600: '#F57C00',

  // Neutrals - Light
  white: '#ffffff',
  gray50: '#f5f5f5',
  gray100: '#f0f0f0',
  gray200: '#e0e0e0',
  gray400: '#aaaaaa',
  gray500: '#888888',
  gray600: '#666666',
  black: '#000000',

  // Neutrals - Dark Theme
  dark900: '#0a0a1e',
  dark800: '#12121f',
  dark700: '#1a1a2e',
  dark600: '#2a2a4e',
  dark500: '#3a3a5e',

  // Special
  transparent: 'transparent',
} as const;

// ============================================
// SEMANTIC COLORS (Theme-aware)
// ============================================

export const colors = {
  light: {
    // Backgrounds
    background: palette.white,
    backgroundSecondary: palette.gray50,
    backgroundTertiary: palette.gray100,
    surface: palette.white,
    surfaceElevated: palette.white,

    // Text
    text: palette.dark700,
    textSecondary: palette.gray600,
    textTertiary: palette.gray500,
    textInverse: palette.white,

    // Borders
    border: palette.gray200,
    borderSubtle: palette.gray100,

    // Brand
    primary: palette.green500,
    primaryHover: palette.green600,
    secondary: palette.blue500,

    // Semantic
    success: palette.green500,
    successBackground: palette.green50,
    error: palette.red500,
    errorBackground: '#ffebee',
    warning: palette.amber600,
    warningBackground: palette.amber50,

    // Recording
    recording: palette.red400,
  },
  dark: {
    // Backgrounds
    background: palette.dark700,
    backgroundSecondary: palette.dark800,
    backgroundTertiary: palette.dark900,
    surface: palette.dark600,
    surfaceElevated: palette.dark500,

    // Text
    text: palette.white,
    textSecondary: palette.gray400,
    textTertiary: palette.gray500,
    textInverse: palette.dark700,

    // Borders
    border: palette.dark500,
    borderSubtle: palette.dark600,

    // Brand
    primary: palette.green500,
    primaryHover: palette.green600,
    secondary: palette.blue500,

    // Semantic
    success: palette.green500,
    successBackground: '#1a3a1a',
    error: palette.red500,
    errorBackground: '#3a1a1a',
    warning: palette.amber300,
    warningBackground: '#3a2a1a',

    // Recording
    recording: palette.red400,
  },
} as const;

// ============================================
// SPACING
// ============================================

/** Spacing scale in pixels */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

// ============================================
// BORDER RADIUS
// ============================================

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

// ============================================
// TYPOGRAPHY
// ============================================

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 32,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

// ============================================
// SHADOWS
// ============================================

export const shadows = {
  sm: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

// ============================================
// OPACITY
// ============================================

export const opacity = {
  disabled: 0.4,
  overlay: 0.6,
  overlayLight: 0.5,
  overlayHeavy: 0.8,
  subtle: 0.1,
  medium: 0.15,
  prominent: 0.2,
} as const;

// ============================================
// ANIMATION
// ============================================

export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

// ============================================
// TYPE EXPORTS
// ============================================

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof colors.light;
export type Spacing = keyof typeof spacing;
export type BorderRadius = keyof typeof borderRadius;
export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
