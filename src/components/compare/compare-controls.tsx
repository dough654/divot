/**
 * CompareControls — Shared control bar for the compare view.
 *
 * Play both, step forward/backward, speed cycling, and sync status.
 * Scrubbing is handled per-panel by each CompareVideoPanel's jog-wheel.
 */
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import type { Theme } from '@/src/context';

export type CompareControlsProps = {
  /** Whether both videos are currently playing. */
  isPlaying: boolean;
  /** Current playback rate (0.25, 0.5, or 1). */
  playbackRate: number;
  /** Whether sync mode is active (both sync points set). */
  isSynced: boolean;
  /** Toggle play/pause for both videos. */
  onTogglePlay: () => void;
  /** Step both videos one frame backward. */
  onStepBackward: () => void;
  /** Step both videos one frame forward. */
  onStepForward: () => void;
  /** Cycle to next playback speed. */
  onCycleSpeed: () => void;
  /** Clear sync points. */
  onClearSync: () => void;
};

export const CompareControls = ({
  isPlaying,
  playbackRate,
  isSynced,
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onCycleSpeed,
  onClearSync,
}: CompareControlsProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const haptics = useHaptics();

  const handleTogglePlay = () => {
    haptics.light();
    onTogglePlay();
  };

  const handleStepBackward = () => {
    haptics.light();
    onStepBackward();
  };

  const handleStepForward = () => {
    haptics.light();
    onStepForward();
  };

  const handleCycleSpeed = () => {
    haptics.light();
    onCycleSpeed();
  };

  const rateLabel = playbackRate === 1 ? '1x' : `${playbackRate}x`;

  return (
    <View style={styles.container}>
      {/* Step backward */}
      <Pressable
        style={styles.controlButton}
        onPress={handleStepBackward}
        accessibilityRole="button"
        accessibilityLabel="Step backward"
      >
        <Ionicons name="play-back" size={18} color={theme.colors.text} />
      </Pressable>

      {/* Play / Pause both */}
      <Pressable
        style={styles.playButton}
        onPress={handleTogglePlay}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause both' : 'Play both'}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={20}
          color={theme.isDark ? theme.palette.black : theme.palette.white}
        />
      </Pressable>

      {/* Step forward */}
      <Pressable
        style={styles.controlButton}
        onPress={handleStepForward}
        accessibilityRole="button"
        accessibilityLabel="Step forward"
      >
        <Ionicons name="play-forward" size={18} color={theme.colors.text} />
      </Pressable>

      {/* Speed */}
      <Pressable
        style={styles.speedButton}
        onPress={handleCycleSpeed}
        accessibilityRole="button"
        accessibilityLabel={`Playback speed ${rateLabel}`}
      >
        <Text style={styles.speedText}>{rateLabel}</Text>
      </Pressable>

      {/* Sync status */}
      <Pressable
        style={[styles.syncBadge, isSynced && styles.syncBadgeActive]}
        onPress={isSynced ? onClearSync : undefined}
        disabled={!isSynced}
        accessibilityRole="button"
        accessibilityLabel={isSynced ? 'Synced — tap to clear' : 'Not synced'}
      >
        <Ionicons
          name={isSynced ? 'link' : 'unlink'}
          size={14}
          color={isSynced
            ? (theme.isDark ? theme.palette.black : theme.palette.white)
            : theme.colors.textTertiary}
        />
        <Text style={[styles.syncText, isSynced && styles.syncTextActive]}>
          {isSynced ? 'synced' : 'no sync'}
        </Text>
      </Pressable>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  controlButton: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
  },
  playButton: {
    width: 42,
    height: 42,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  speedButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  speedText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 12,
    color: theme.colors.text,
    fontVariant: ['tabular-nums' as const],
  },
  syncBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  syncBadgeActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  syncText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  syncTextActive: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
}));
