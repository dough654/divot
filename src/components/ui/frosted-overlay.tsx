import { View, Platform, StyleProp, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { useTheme } from '../../context';

export type FrostedOverlayProps = {
  children: ReactNode;
  /** Blur intensity (iOS only). Defaults to 40. */
  intensity?: number;
  /** Additional styles for the container. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Frosted glass overlay — uses BlurView on iOS, opaque dark fallback on Android.
 * Use for floating HUD elements on video screens.
 */
export const FrostedOverlay = ({
  children,
  intensity = 40,
  style,
}: FrostedOverlayProps) => {
  const { theme } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={intensity}
        tint={theme.isDark ? 'dark' : 'light'}
        style={[{ overflow: 'hidden' }, style]}
      >
        {children}
      </BlurView>
    );
  }

  // Android fallback — opaque dark background
  return (
    <View
      style={[
        {
          backgroundColor: 'rgba(0,0,0,0.8)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
