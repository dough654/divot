import { View, StyleSheet, DimensionValue } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../context';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular';

export type SkeletonProps = {
  /** Shape variant */
  variant?: SkeletonVariant;
  /** Width in pixels or percentage string */
  width?: DimensionValue;
  /** Height in pixels */
  height?: number;
  /** Border radius override */
  borderRadius?: number;
};

/**
 * Skeleton loader with shimmer animation.
 * Use for loading placeholders to improve perceived performance.
 */
export const Skeleton = ({
  variant = 'text',
  width,
  height,
  borderRadius,
}: SkeletonProps) => {
  const { theme } = useTheme();
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmerProgress]);

  const getDefaultDimensions = (): { width: DimensionValue; height: number } => {
    switch (variant) {
      case 'text':
        return { width: width ?? '100%', height: height ?? 16 };
      case 'circular':
        return { width: width ?? 40, height: height ?? 40 };
      case 'rectangular':
        return { width: width ?? '100%', height: height ?? 100 };
    }
  };

  const getDefaultBorderRadius = () => {
    if (borderRadius !== undefined) return borderRadius;
    switch (variant) {
      case 'text':
        return 4;
      case 'circular':
        return 9999;
      case 'rectangular':
        return 8;
    }
  };

  const dimensions = getDefaultDimensions();
  const baseColor = theme.isDark ? '#2a2a4e' : '#e0e0e0';

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shimmerProgress.value,
      [0, 0.5, 1],
      [0.5, 1, 0.5]
    );

    return {
      opacity,
    };
  });

  return (
    <View
      style={{
        width: dimensions.width,
        height: dimensions.height,
        borderRadius: getDefaultBorderRadius(),
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: baseColor,
          },
          animatedStyle,
        ]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
      />
    </View>
  );
};

/**
 * Skeleton preset matching the ClipItem layout.
 */
export const SkeletonClipItem = () => {
  const { theme } = useTheme();

  return (
    <View style={[styles.clipItem, { backgroundColor: theme.colors.surface }]}>
      <Skeleton variant="rectangular" width={56} height={56} borderRadius={8} />
      <View style={styles.clipItemContent}>
        <Skeleton variant="text" width="70%" height={16} />
        <View style={styles.clipItemMeta}>
          <Skeleton variant="text" width={40} height={12} />
          <Skeleton variant="text" width={50} height={12} />
          <Skeleton variant="text" width={35} height={12} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {},
  clipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  clipItemContent: {
    flex: 1,
    gap: 8,
  },
  clipItemMeta: {
    flexDirection: 'row',
    gap: 12,
  },
});
