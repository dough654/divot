import { View, Text } from 'react-native';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { getTempoRating } from '@/src/utils/swing-tempo';
import type { TempoRating } from '@/src/utils/swing-tempo';
import type { Theme } from '@/src/context';

export type TempoData = {
  tempoRatio: number;
  backswingDurationMs: number;
  downswingDurationMs: number;
  /** Takeaway timestamp in ms (relative to video start). */
  takeawayTimestampMs?: number;
  /** Top-of-backswing timestamp in ms. */
  peakTimestampMs?: number;
  /** Impact timestamp in ms. */
  impactTimestampMs?: number;
};

export type TempoBarProps = {
  /** Tempo data from the clip. */
  tempo: TempoData;
};

/**
 * Returns the color for a tempo rating using theme colors.
 */
const getRatingColor = (rating: TempoRating, theme: Theme): string => {
  switch (rating) {
    case 'ideal':
      return theme.colors.success;
    case 'fast':
    case 'slow':
      return theme.colors.warning;
  }
};

/**
 * Formats milliseconds as a video timestamp: M:SS.T (e.g. 0:01.4).
 */
const formatVideoTimestamp = (ms: number): string => {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const wholeSeconds = Math.floor(seconds);
  const tenths = Math.floor((seconds - wholeSeconds) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
};

/**
 * Formats milliseconds as seconds with one decimal place.
 */
const formatDurationSeconds = (ms: number): string => {
  return `${(ms / 1000).toFixed(1)}s`;
};

/**
 * Persistent tempo stats bar displayed between video and frame scrubber.
 *
 * Shows tempo ratio (color-coded) and phase timing with timestamp windows.
 * Only rendered when clip has tempo data.
 */
export const TempoBar = ({ tempo }: TempoBarProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const rating = getTempoRating(tempo.tempoRatio);
  const ratingColor = getRatingColor(rating, theme);

  const hasTimestamps = tempo.takeawayTimestampMs != null &&
    tempo.peakTimestampMs != null &&
    tempo.impactTimestampMs != null;

  return (
    <View style={styles.container}>
      <Text style={[styles.ratio, { color: ratingColor }]}>
        {tempo.tempoRatio.toFixed(1)} : 1
      </Text>
      <View style={styles.durations}>
        {hasTimestamps ? (
          <>
            <Text style={styles.durationText}>
              {formatVideoTimestamp(tempo.takeawayTimestampMs!)}-{formatVideoTimestamp(tempo.peakTimestampMs!)} {formatDurationSeconds(tempo.backswingDurationMs)} ↑
            </Text>
            <Text style={styles.durationText}>
              {formatVideoTimestamp(tempo.peakTimestampMs!)}-{formatVideoTimestamp(tempo.impactTimestampMs!)} {formatDurationSeconds(tempo.downswingDurationMs)} ↓
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.durationText}>
              {formatDurationSeconds(tempo.backswingDurationMs)} ↑
            </Text>
            <Text style={styles.durationText}>
              {formatDurationSeconds(tempo.downswingDurationMs)} ↓
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  ratio: {
    fontFamily: theme.fontFamily.display,
    fontSize: 20,
    letterSpacing: -0.3,
    textTransform: 'uppercase' as const,
  },
  durations: {
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
    gap: 2,
  },
  durationText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
}));
