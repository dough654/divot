/**
 * CompareScrubber — Compact slider scrubber for the compare view.
 *
 * Thin 4px track with draggable 12px thumb, optional sync-point diamond
 * marker, and current/total time label. Uses Gesture.Pan() + Reanimated.
 */
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { formatTimeCompact } from '@/src/utils/compare-sync';
import type { Theme } from '@/src/context';

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 12;
const SCRUBBER_HEIGHT = 32;

export type CompareScrubberProps = {
  /** Total duration in ms. */
  duration: number;
  /** Current position in ms. */
  position: number;
  /** Sync point position in ms, or null if unset. */
  syncPointMs: number | null;
  /** Called when the user begins dragging. */
  onSeekStart?: () => void;
  /** Called continuously during drag with position in ms. */
  onSeekChange?: (positionMs: number) => void;
  /** Called when drag ends with final position in ms. */
  onSeekComplete?: (positionMs: number) => void;
};

export const CompareScrubber = ({
  duration,
  position,
  syncPointMs,
  onSeekStart,
  onSeekChange,
  onSeekComplete,
}: CompareScrubberProps) => {
  const styles = useThemedStyles(createStyles);
  const trackWidth = useSharedValue(0);

  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const syncProgress = syncPointMs !== null && duration > 0
    ? Math.min(1, Math.max(0, syncPointMs / duration))
    : null;

  const durationSV = useSharedValue(duration);
  durationSV.value = duration;

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      const fraction = Math.max(0, Math.min(1, event.x / trackWidth.value));
      const ms = Math.round(Math.max(0, Math.min(durationSV.value, fraction * durationSV.value)));
      if (onSeekStart) scheduleOnRN(onSeekStart);
      if (onSeekChange) scheduleOnRN(onSeekChange, ms);
    })
    .onUpdate((event) => {
      const fraction = Math.max(0, Math.min(1, event.x / trackWidth.value));
      const ms = Math.round(Math.max(0, Math.min(durationSV.value, fraction * durationSV.value)));
      if (onSeekChange) scheduleOnRN(onSeekChange, ms);
    })
    .onEnd((event) => {
      const fraction = Math.max(0, Math.min(1, event.x / trackWidth.value));
      const ms = Math.round(Math.max(0, Math.min(durationSV.value, fraction * durationSV.value)));
      if (onSeekComplete) scheduleOnRN(onSeekComplete, ms);
    });

  const filledStyle = useAnimatedStyle(() => ({
    width: `${progress * 100}%` as unknown as number,
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${progress * 100}%` as unknown as number,
    marginLeft: -(THUMB_SIZE / 2),
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.trackArea}
          onLayout={(e) => {
            trackWidth.value = e.nativeEvent.layout.width;
          }}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.trackFilled, filledStyle]} />
          </View>

          {/* Sync point diamond marker */}
          {syncProgress !== null && (
            <View
              style={[
                styles.syncMarker,
                { left: `${syncProgress * 100}%` as unknown as number, marginLeft: -4 },
              ]}
            />
          )}

          {/* Thumb */}
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>

      <View style={styles.timeRow}>
        <Text style={styles.timeText}>
          {formatTimeCompact(position)} / {formatTimeCompact(duration)}
        </Text>
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    height: SCRUBBER_HEIGHT,
    justifyContent: 'center' as const,
  },
  trackArea: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center' as const,
    paddingHorizontal: 6,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  trackFilled: {
    height: '100%' as const,
    backgroundColor: theme.colors.accent,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute' as const,
    top: (THUMB_SIZE + 8 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.colors.accent,
  },
  syncMarker: {
    position: 'absolute' as const,
    top: (THUMB_SIZE + 8 - 8) / 2,
    width: 8,
    height: 8,
    backgroundColor: theme.colors.text,
    transform: [{ rotate: '45deg' }],
  },
  timeRow: {
    alignItems: 'flex-end' as const,
    paddingHorizontal: 6,
    marginTop: 1,
  },
  timeText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums' as const],
  },
}));
