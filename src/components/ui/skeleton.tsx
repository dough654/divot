import { View, DimensionValue } from 'react-native';
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
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

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
  const baseColor = theme.isDark ? '#1A1A1A' : '#E0E0E0';

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
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.clipItem}>
      <Skeleton variant="text" width={22} height={22} />
      <View style={styles.clipItemContent}>
        <Skeleton variant="text" width="70%" height={15} />
        <Skeleton variant="text" width="50%" height={10} />
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  clipItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  clipItemContent: {
    flex: 1,
    gap: 6,
  },
}));
