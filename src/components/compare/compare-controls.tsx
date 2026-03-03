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
      {/* Left — sync status */}
      <View style={styles.sideSection}>
        <Pressable
          style={[styles.syncBadge, isSynced && styles.syncBadgeActive]}
          onPress={isSynced ? onClearSync : undefined}
          disabled={!isSynced}
          accessibilityRole="button"
          accessibilityLabel={isSynced ? 'Synced — tap to clear' : 'Not synced'}
        >
          <Ionicons
            name={isSynced ? 'link' : 'unlink'}
            size={16}
            color={isSynced
              ? (theme.isDark ? theme.palette.black : theme.palette.white)
              : theme.colors.textTertiary}
          />
          <Text style={[styles.syncText, isSynced && styles.syncTextActive]}>
            {isSynced ? 'synced' : 'no sync'}
          </Text>
        </Pressable>
      </View>

      {/* Center — transport controls */}
      <View style={styles.transportControls}>
        <Pressable
          style={styles.controlButton}
          onPress={handleStepBackward}
          accessibilityRole="button"
          accessibilityLabel="Step backward"
        >
          <Ionicons name="play-back" size={22} color={theme.colors.text} />
        </Pressable>

        <Pressable
          style={styles.playButton}
          onPress={handleTogglePlay}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause both' : 'Play both'}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={theme.isDark ? theme.palette.black : theme.palette.white}
          />
        </Pressable>

        <Pressable
          style={styles.controlButton}
          onPress={handleStepForward}
          accessibilityRole="button"
          accessibilityLabel="Step forward"
        >
          <Ionicons name="play-forward" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Right — speed */}
      <View style={styles.sideSectionRight}>
        <Pressable
          style={styles.speedButton}
          onPress={handleCycleSpeed}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${rateLabel}`}
        >
          <Text style={styles.speedText}>{rateLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  sideSection: {
    zIndex: 1,
    alignItems: 'flex-start' as const,
  },
  sideSectionRight: {
    zIndex: 1,
    alignItems: 'flex-end' as const,
  },
  transportControls: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.md,
    pointerEvents: 'box-none' as const,
  },
  controlButton: {
    width: 44,
    height: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
  },
  playButton: {
    width: 52,
    height: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  speedButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  speedText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 14,
    color: theme.colors.text,
    fontVariant: ['tabular-nums' as const],
  },
  syncBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
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
    fontSize: 12,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  syncTextActive: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
}));
