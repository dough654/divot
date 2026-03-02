import { View, Text } from 'react-native';
import { useMemo, useEffect } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

const PIXELS_PER_SECOND = 150;
const MINOR_TICK_INTERVAL_MS = 100;
const MAJOR_TICK_INTERVAL_MS = 1000;
const SCRUBBER_HEIGHT = 48;

export type FrameScrubberProps = {
  /** Total duration in ms. */
  duration: number;
  /** Current position in ms. */
  position: number;
  /** Called when the user begins a scrub gesture. */
  onSeekStart?: () => void;
  /** Called continuously during scrubbing with the computed position. */
  onSeekChange?: (positionMs: number) => void;
  /** Called when the scrub gesture ends (including after decay). */
  onSeekComplete?: (positionMs: number) => void;
};

/**
 * Formats milliseconds to MM:SS.t format (tenths of a second).
 */
const formatTimePrecise = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((millis % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
};

/**
 * Jog-wheel tick-strip scrubber for frame-accurate video navigation.
 *
 * Renders a horizontal strip of evenly-spaced tick marks with a fixed
 * center playhead. Dragging moves the tick strip; swiping applies
 * momentum decay. Minor ticks every 100ms, major ticks every 1s.
 */
export const FrameScrubber = ({
  duration,
  position,
  onSeekStart,
  onSeekChange,
  onSeekComplete,
}: FrameScrubberProps) => {
  const styles = useThemedStyles(createStyles);

  const offsetX = useSharedValue(0);
  const savedOffsetX = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const containerWidthSV = useSharedValue(0);

  // Mirror JS values into shared values for worklet access
  const durationSV = useSharedValue(duration);
  const totalWidthSV = useSharedValue((duration / 1000) * PIXELS_PER_SECOND);

  useEffect(() => {
    durationSV.value = duration;
    totalWidthSV.value = (duration / 1000) * PIXELS_PER_SECOND;
  }, [duration]);

  // Sync offset from playback position (suppressed during gesture)
  useEffect(() => {
    if (isSeeking.value) return;
    const totalWidth = (duration / 1000) * PIXELS_PER_SECOND;
    if (totalWidth <= 0 || duration <= 0) return;
    offsetX.value = -(position / duration) * totalWidth;
  }, [position, duration]);

  const ticks = useMemo(() => {
    const result: Array<{ x: number; isMajor: boolean; key: number }> = [];
    const tickCount = Math.ceil(duration / MINOR_TICK_INTERVAL_MS);
    for (let i = 0; i <= tickCount; i++) {
      const timeMs = i * MINOR_TICK_INTERVAL_MS;
      const x = (timeMs / 1000) * PIXELS_PER_SECOND;
      const isMajor = timeMs % MAJOR_TICK_INTERVAL_MS === 0;
      result.push({ x, isMajor, key: i });
    }
    return result;
  }, [duration]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedOffsetX.value = offsetX.value;
      isSeeking.value = true;
      if (onSeekStart) {
        scheduleOnRN(onSeekStart);
      }
    })
    .onUpdate((event) => {
      const totalWidth = totalWidthSV.value;
      const dur = durationSV.value;
      if (totalWidth <= 0 || dur <= 0) return;

      const newOffset = Math.max(
        -totalWidth,
        Math.min(0, savedOffsetX.value + event.translationX)
      );
      offsetX.value = newOffset;

      if (onSeekChange) {
        const computedPosition = Math.max(
          0,
          Math.min(dur, (-newOffset / totalWidth) * dur)
        );
        scheduleOnRN(onSeekChange, computedPosition);
      }
    })
    .onEnd((event) => {
      const totalWidth = totalWidthSV.value;
      const dur = durationSV.value;
      if (totalWidth <= 0 || dur <= 0) {
        isSeeking.value = false;
        return;
      }

      offsetX.value = withDecay(
        {
          velocity: event.velocityX,
          clamp: [-totalWidth, 0],
        },
        (finished) => {
          'worklet';
          if (finished !== undefined) {
            isSeeking.value = false;
            const finalPosition = Math.max(
              0,
              Math.min(dur, (-offsetX.value / totalWidth) * dur)
            );
            if (onSeekComplete) {
              scheduleOnRN(onSeekComplete, finalPosition);
            }
          }
        }
      );
    });

  const tickContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value + containerWidthSV.value / 2 }],
  }));

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        containerWidthSV.value = event.nativeEvent.layout.width;
      }}
    >
      {/* Time labels */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTimePrecise(position)}</Text>
        <Text style={styles.timeText}>{formatTimePrecise(duration)}</Text>
      </View>

      {/* Tick strip */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.tickArea}>
          <Animated.View style={[styles.tickContainer, tickContainerStyle]}>
            {ticks.map((tick) => (
              <View
                key={tick.key}
                style={[
                  styles.tick,
                  tick.isMajor ? styles.tickMajor : styles.tickMinor,
                  { left: tick.x },
                ]}
              />
            ))}
          </Animated.View>

          {/* Center playhead */}
          <View style={styles.playhead} pointerEvents="none" />
        </View>
      </GestureDetector>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    height: SCRUBBER_HEIGHT + 20,
    backgroundColor: theme.colors.background,
    overflow: 'hidden' as const,
  },
  timeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    marginBottom: 2,
  },
  timeText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums' as const],
  },
  tickArea: {
    height: SCRUBBER_HEIGHT,
    overflow: 'hidden' as const,
  },
  tickContainer: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 0,
  },
  tick: {
    position: 'absolute' as const,
    bottom: 0,
    width: 1,
  },
  tickMinor: {
    height: 8,
    backgroundColor: theme.colors.textTertiary,
  },
  tickMajor: {
    height: 16,
    backgroundColor: theme.colors.textSecondary,
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: '50%' as unknown as number,
    width: 2,
    marginLeft: -1,
    backgroundColor: theme.colors.accent,
  },
}));
