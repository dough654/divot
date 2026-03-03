/**
 * CompareVideoPanel — Lightweight single-video player for the compare view.
 *
 * Wraps expo-av Video with an imperative ref API for coordinated playback.
 * No scrubber — scrubbing is handled by the shared jog-wheel in CompareControls.
 */
import { View, Text, Pressable } from 'react-native';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

/** Assumed frame duration for step operations (30fps). */
const FRAME_DURATION_MS = 33;

export type CompareVideoPanelHandle = {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  getPosition: () => number;
  getDuration: () => number;
  stepFrame: (direction: 'forward' | 'backward') => Promise<void>;
};

export type CompareVideoPanelProps = {
  /** Clip file URI, or null when slot is empty. */
  uri: string | null;
  /** Slot label displayed as a badge. */
  slotLabel: string;
  /** Sync point in ms, or null if unset. */
  syncPointMs: number | null;
  /** When true, suppresses position updates from playback status (external scrubbing). */
  isSeeking?: boolean;
  /** Called when user taps "set sync" pill. */
  onSetSyncPoint?: (positionMs: number) => void;
  /** Called when user taps the empty slot or loaded video to pick a clip. */
  onPickClip?: () => void;
  /** Called on each playback status update with current position/duration/playing state. */
  onPlaybackUpdate?: (update: { position: number; duration: number; isPlaying: boolean }) => void;
};

/**
 * Seeks to a position, suppressing "interrupted" errors from rapid seeking.
 */
const safeSeek = async (videoRef: React.RefObject<Video | null>, positionMs: number) => {
  if (!videoRef.current) return;
  try {
    await videoRef.current.setPositionAsync(positionMs, {
      toleranceMillisBefore: 0,
      toleranceMillisAfter: 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('interrupted')) {
      console.error('Seek error:', err);
    }
  }
};

export const CompareVideoPanel = forwardRef<CompareVideoPanelHandle, CompareVideoPanelProps>(
  ({ uri, slotLabel, syncPointMs, isSeeking = false, onSetSyncPoint, onPickClip, onPlaybackUpdate }, ref) => {
    const { theme } = useTheme();
    const styles = useThemedStyles(createStyles);
    const videoRef = useRef<Video | null>(null);

    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const positionRef = useRef(0);

    const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsLoaded(false);
        return;
      }
      setIsLoaded(true);
      setIsPlaying(status.isPlaying);
      const dur = status.durationMillis || 0;
      setDuration(dur);

      if (!isSeeking) {
        const pos = status.positionMillis || 0;
        positionRef.current = pos;
        onPlaybackUpdate?.({ position: pos, duration: dur, isPlaying: status.isPlaying });
      }
    }, [isSeeking, onPlaybackUpdate]);

    useImperativeHandle(ref, () => ({
      play: async () => {
        await videoRef.current?.playAsync();
      },
      pause: async () => {
        await videoRef.current?.pauseAsync();
      },
      seekTo: async (positionMs: number) => {
        positionRef.current = positionMs;
        await safeSeek(videoRef, positionMs);
      },
      setRate: async (rate: number) => {
        await videoRef.current?.setRateAsync(rate, true);
      },
      getPosition: () => positionRef.current,
      getDuration: () => duration,
      stepFrame: async (direction: 'forward' | 'backward') => {
        const delta = direction === 'forward' ? FRAME_DURATION_MS : -FRAME_DURATION_MS;
        const target = Math.max(0, Math.min(duration, positionRef.current + delta));
        positionRef.current = target;
        await safeSeek(videoRef, target);
      },
    }), [duration]);

    // Empty slot
    if (!uri) {
      return (
        <Pressable style={styles.emptySlot} onPress={onPickClip}>
          <View style={styles.slotBadge}>
            <Text style={styles.slotBadgeText}>{slotLabel}</Text>
          </View>
          <Ionicons name="add-circle-outline" size={40} color={theme.colors.textTertiary} />
          <Text style={styles.emptySlotText}>tap to select clip</Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.panelContainer}>
        <Pressable style={styles.videoWrapper} onPress={onPickClip}>
          <Video
            ref={videoRef}
            source={{ uri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            isLooping={false}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          />

          {/* Slot badge */}
          <View style={styles.slotBadge}>
            <Text style={styles.slotBadgeText}>{slotLabel}</Text>
          </View>

          {/* Set sync pill — shown when paused and loaded */}
          {!isPlaying && isLoaded && onSetSyncPoint && (
            <Pressable
              style={styles.syncPill}
              onPress={() => onSetSyncPoint(positionRef.current)}
            >
              <Ionicons name="flag" size={12} color={theme.isDark ? theme.palette.black : theme.palette.white} />
              <Text style={styles.syncPillText}>
                {syncPointMs !== null ? 'update sync' : 'set sync'}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </View>
    );
  },
);

CompareVideoPanel.displayName = 'CompareVideoPanel';

const createStyles = makeThemedStyles((theme: Theme) => ({
  panelContainer: {
    flex: 1,
  },
  videoWrapper: {
    flex: 1,
    backgroundColor: theme.palette.black,
    position: 'relative' as const,
  },
  video: {
    flex: 1,
  },
  slotBadge: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.xs,
  },
  slotBadgeText: {
    fontFamily: theme.fontFamily.display,
    fontSize: 14,
    color: '#FFFFFF',
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
  },
  syncPill: {
    position: 'absolute' as const,
    bottom: 8,
    alignSelf: 'center' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  syncPillText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: 11,
    color: theme.isDark ? theme.palette.black : theme.palette.white,
    textTransform: 'lowercase' as const,
  },
  emptySlot: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed' as const,
    borderRadius: theme.borderRadius.md,
    gap: 8,
    margin: 4,
  },
  emptySlotText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
}));
