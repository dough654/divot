/**
 * Divot Design Tokens — Stark Design System
 * Pure black/white, gold accent, Darker Grotesque display, Manrope body.
 */

// ============================================
// FONT FAMILIES
// ============================================

/** Font family tokens — must match loaded font names in _layout.tsx */
export const fontFamily = {
  display: 'DarkerGrotesque_900Black',
  displaySemiBold: 'DarkerGrotesque_800ExtraBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: 'SpaceMono',
} as const;

// ============================================
// COLOR PALETTE
// ============================================

/** Raw color palette — use semantic tokens in components */
export const palette = {
  // Pure neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Dark neutrals
  dark950: '#080808',
  dark900: '#0D0D0D',
  dark800: '#1A1A1A',
  dark700: '#555555',
  dark600: '#999999',

  // Light neutrals
  light100: '#F5F5F5',
  light200: '#FAFAFA',
  light300: '#E0E0E0',
  light400: '#999999',
  light500: '#666666',

  // Gold accent
  gold: '#E5A020',
  goldDark: '#B8800E',
  goldDim: 'rgba(229,160,32,0.12)',
  goldDimLight: 'rgba(184,128,14,0.10)',

  // Reds (Danger/Recording)
  red400: '#ff453a',
  red500: '#FF2D2D',
  redDim: 'rgba(255,45,45,0.08)',
  redDimLight: 'rgba(204,26,26,0.06)',

  // Greens (Success)
  green500: '#00CC66',
  greenDim: 'rgba(0,204,102,0.08)',
  greenDimLight: 'rgba(0,153,80,0.06)',

  // Blues (Info — kept for semantic use)
  blue500: '#2196F3',

  // Ambers (Warning)
  amber300: '#FFB74D',
  amber600: '#F57C00',

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
    backgroundSecondary: palette.light100,
    backgroundTertiary: palette.light300,
    surface: palette.light200,
    surfaceElevated: palette.white,

    // Text
    text: palette.black,
    textSecondary: palette.light500,
    textTertiary: palette.light400,
    textInverse: palette.white,

    // Borders
    border: palette.light300,
    borderSubtle: palette.light100,

    // Brand
    primary: palette.goldDark,
    primaryHover: palette.gold,
    secondary: palette.blue500,

    // Accent
    accent: palette.goldDark,
    accentDim: palette.goldDimLight,

    // Semantic
    success: '#009950',
    successBackground: palette.greenDimLight,
    error: '#CC1A1A',
    errorBackground: palette.redDimLight,
    warning: palette.amber600,
    warningBackground: 'rgba(245,124,0,0.06)',
    info: palette.blue500,
    infoBackground: 'rgba(33,150,243,0.06)',

    // Recording
    recording: palette.red400,
  },
  dark: {
    // Backgrounds
    background: palette.black,
    backgroundSecondary: palette.dark950,
    backgroundTertiary: palette.dark900,
    surface: palette.dark900,
    surfaceElevated: palette.dark800,

    // Text
    text: palette.white,
    textSecondary: palette.dark600,
    textTertiary: palette.dark700,
    textInverse: palette.black,

    // Borders
    border: palette.dark800,
    borderSubtle: palette.dark900,

    // Brand
    primary: palette.gold,
    primaryHover: palette.goldDark,
    secondary: palette.blue500,

    // Accent
    accent: palette.gold,
    accentDim: palette.goldDim,

    // Semantic
    success: palette.green500,
    successBackground: palette.greenDim,
    error: palette.red500,
    errorBackground: palette.redDim,
    warning: palette.amber300,
    warningBackground: 'rgba(255,183,77,0.08)',
    info: palette.blue500,
    infoBackground: 'rgba(33,150,243,0.08)',

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
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 16,
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
// SHADOWS (Stark: mostly flat)
// ============================================

export const shadows = {
  sm: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  md: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  lg: {
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
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

/** Theme color keys — same structure for light and dark */
export type ThemeColors = {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  accent: string;
  accentDim: string;
  success: string;
  successBackground: string;
  error: string;
  errorBackground: string;
  warning: string;
  warningBackground: string;
  info: string;
  infoBackground: string;
  recording: string;
};

export type Spacing = keyof typeof spacing;
export type BorderRadius = keyof typeof borderRadius;
export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
