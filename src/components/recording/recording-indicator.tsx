import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type RecordingIndicatorProps = {
  /** Duration in seconds. */
  duration: number;
  /** Whether to show the indicator. */
  visible: boolean;
  /** Whether to use compact layout. */
  compact?: boolean;
};

/**
 * Formats seconds into MM:SS format.
 */
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Recording indicator with pulsing red dot and duration timer.
 * Stark style: frosted pill with lowercase text.
 */
export const RecordingIndicator = ({
  duration,
  visible,
  compact = false,
}: RecordingIndicatorProps) => {
  const styles = useThemedStyles(createStyles);
  const opacity = useSharedValue(1);

  // Pulse animation for the red dot
  useEffect(() => {
    if (visible) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      opacity.value = 1;
    }
  }, [visible, opacity]);

  const animatedDotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Animated.View style={[styles.dot, compact && styles.dotCompact, animatedDotStyle]} />
      <Text style={[styles.text, compact && styles.textCompact]}>
        {compact ? 'rec' : formatDuration(duration)}
      </Text>
      {!compact && <Text style={styles.label}>rec</Text>}
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 5,
  },
  containerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.recording,
  },
  dotCompact: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  text: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: theme.fontFamily.bodyBold,
    fontVariant: ['tabular-nums' as const],
    textTransform: 'lowercase' as const,
  },
  textCompact: {
    fontSize: 8,
  },
  label: {
    color: theme.colors.recording,
    fontSize: 9,
    fontFamily: theme.fontFamily.bodyBold,
    marginLeft: 2,
    textTransform: 'lowercase' as const,
  },
}));
