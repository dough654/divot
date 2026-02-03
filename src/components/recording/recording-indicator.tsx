import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

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
 * Shows the current recording duration and a pulsing indicator.
 */
export const RecordingIndicator = ({
  duration,
  visible,
  compact = false,
}: RecordingIndicatorProps) => {
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
        {compact ? 'REC' : formatDuration(duration)}
      </Text>
      {!compact && <Text style={styles.label}>REC</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  containerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff3b30',
  },
  dotCompact: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  textCompact: {
    fontSize: 12,
  },
  label: {
    color: '#ff3b30',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
});
