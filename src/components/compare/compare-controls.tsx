/**
 * CompareControls — Bottom control bar with embedded jog-wheel scrubber.
 *
 * Left ~1/3: play/pause, step, speed, sync badge (compact column).
 * Right ~2/3: FrameScrubber jog-wheel driving both videos.
 */
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useHaptics } from '@/src/hooks';
import { FrameScrubber } from '@/src/components/playback';
import type { Theme } from '@/src/context';

export type CompareControlsProps = {
  /** Whether both videos are currently playing. */
  isPlaying: boolean;
  /** Current playback rate (0.25, 0.5, or 1). */
  playbackRate: number;
  /** Whether sync mode is active (both sync points set). */
  isSynced: boolean;
  /** Current position for the jog-wheel (ms). */
  position: number;
  /** Duration for the jog-wheel (ms). */
  duration: number;
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
  /** Called when jog-wheel scrub begins. */
  onSeekStart: () => void;
  /** Called continuously during jog-wheel scrub. */
  onSeekChange: (positionMs: number) => void;
  /** Called when jog-wheel scrub ends. */
  onSeekComplete: (positionMs: number) => void;
};

export const CompareControls = ({
  isPlaying,
  playbackRate,
  isSynced,
  position,
  duration,
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onCycleSpeed,
  onClearSync,
  onSeekStart,
  onSeekChange,
  onSeekComplete,
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
      {/* Left: compact button column */}
      <View style={styles.buttonsColumn}>
        <View style={styles.buttonRow}>
          <Pressable
            style={styles.controlButton}
            onPress={handleStepBackward}
            accessibilityRole="button"
            accessibilityLabel="Step backward"
          >
            <Ionicons name="play-back" size={16} color={theme.colors.text} />
          </Pressable>

          <Pressable
            style={styles.playButton}
            onPress={handleTogglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause both' : 'Play both'}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color={theme.isDark ? theme.palette.black : theme.palette.white}
            />
          </Pressable>

          <Pressable
            style={styles.controlButton}
            onPress={handleStepForward}
            accessibilityRole="button"
            accessibilityLabel="Step forward"
          >
            <Ionicons name="play-forward" size={16} color={theme.colors.text} />
          </Pressable>
        </View>

        <View style={styles.badgeRow}>
          <Pressable
            style={styles.speedButton}
            onPress={handleCycleSpeed}
            accessibilityRole="button"
            accessibilityLabel={`Playback speed ${rateLabel}`}
          >
            <Text style={styles.speedText}>{rateLabel}</Text>
          </Pressable>

          <Pressable
            style={[styles.syncBadge, isSynced && styles.syncBadgeActive]}
            onPress={isSynced ? onClearSync : undefined}
            disabled={!isSynced}
            accessibilityRole="button"
            accessibilityLabel={isSynced ? 'Synced — tap to clear' : 'Not synced'}
          >
            <Ionicons
              name={isSynced ? 'link' : 'unlink'}
              size={12}
              color={isSynced
                ? (theme.isDark ? theme.palette.black : theme.palette.white)
                : theme.colors.textTertiary}
            />
            <Text style={[styles.syncText, isSynced && styles.syncTextActive]}>
              {isSynced ? 'synced' : 'no sync'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Right: jog-wheel scrubber */}
      <View style={styles.scrubberArea}>
        <FrameScrubber
          duration={duration}
          position={position}
          onSeekStart={onSeekStart}
          onSeekChange={onSeekChange}
          onSeekComplete={onSeekComplete}
        />
      </View>
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.sm,
  },
  buttonsColumn: {
    alignItems: 'center' as const,
    gap: 2,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  controlButton: {
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
  },
  playButton: {
    width: 36,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  speedButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  speedText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 11,
    color: theme.colors.text,
    fontVariant: ['tabular-nums' as const],
  },
  syncBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
    fontSize: 10,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  syncTextActive: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
  scrubberArea: {
    flex: 2,
  },
}));
