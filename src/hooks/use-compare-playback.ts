/**
 * useComparePlayback — Coordinates synchronized playback between two video panels.
 *
 * Manages sync offset math, coordinated seek, play/pause both,
 * speed cycling, and frame stepping.
 */
import { useState, useCallback } from 'react';

import type { CompareVideoPanelHandle } from '@/src/components/compare/compare-video-panel';
import { computeSyncOffset, computeSyncedPosition } from '@/src/utils/compare-sync';

const PLAYBACK_SPEEDS = [0.25, 0.5, 1] as const;

export type SyncState = {
  leftSyncPointMs: number | null;
  rightSyncPointMs: number | null;
};

export type ComparePlaybackState = {
  isPlaying: boolean;
  playbackRate: number;
  syncState: SyncState;
  isSynced: boolean;
};

export type ComparePlaybackActions = {
  /** Play both videos from their current (or sync-offset) positions. */
  playBoth: () => Promise<void>;
  /** Pause both videos. */
  pauseBoth: () => Promise<void>;
  /** Toggle play/pause for both. */
  togglePlayBoth: () => Promise<void>;
  /** Step both videos one frame in the given direction. */
  stepBoth: (direction: 'forward' | 'backward') => Promise<void>;
  /** Cycle playback speed (0.25x → 0.5x → 1x). */
  cycleSpeed: () => void;
  /** Set the sync point for the left video at the given position. */
  setLeftSyncPoint: (positionMs: number) => void;
  /** Set the sync point for the right video at the given position. */
  setRightSyncPoint: (positionMs: number) => void;
  /** Clear both sync points. */
  clearSync: () => void;
  /** Seek a specific panel and, if synced, apply the offset to the other. */
  seekWithSync: (panel: 'left' | 'right', positionMs: number) => Promise<void>;
  /** Seek only the OTHER panel with sync offset applied. No-op if not synced. */
  seekOther: (sourcePanel: 'left' | 'right', sourcePositionMs: number) => Promise<void>;
  /** Reset state for a slot (when clip changes). */
  resetSlot: (panel: 'left' | 'right') => void;
};

/**
 * Hook that coordinates two CompareVideoPanel refs for synchronized playback.
 */
export const useComparePlayback = (
  leftRef: React.RefObject<CompareVideoPanelHandle | null>,
  rightRef: React.RefObject<CompareVideoPanelHandle | null>,
): ComparePlaybackState & ComparePlaybackActions => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [syncState, setSyncState] = useState<SyncState>({
    leftSyncPointMs: null,
    rightSyncPointMs: null,
  });

  const offsetMs = computeSyncOffset(syncState.leftSyncPointMs, syncState.rightSyncPointMs);
  const isSynced = offsetMs !== null;

  const playBoth = useCallback(async () => {
    if (isSynced && leftRef.current && rightRef.current) {
      const leftPos = leftRef.current.getPosition();
      const rightTarget = computeSyncedPosition(leftPos, offsetMs, 'left');
      if (rightTarget !== null) await rightRef.current.seekTo(rightTarget);
    }
    await Promise.all([
      leftRef.current?.setRate(playbackRate),
      rightRef.current?.setRate(playbackRate),
    ]);
    await Promise.all([
      leftRef.current?.play(),
      rightRef.current?.play(),
    ]);
    setIsPlaying(true);
  }, [leftRef, rightRef, isSynced, offsetMs, playbackRate]);

  const pauseBoth = useCallback(async () => {
    await Promise.all([
      leftRef.current?.pause(),
      rightRef.current?.pause(),
    ]);
    setIsPlaying(false);
  }, [leftRef, rightRef]);

  const togglePlayBoth = useCallback(async () => {
    if (isPlaying) {
      await pauseBoth();
    } else {
      await playBoth();
    }
  }, [isPlaying, pauseBoth, playBoth]);

  const stepBoth = useCallback(async (direction: 'forward' | 'backward') => {
    if (isPlaying) await pauseBoth();
    await Promise.all([
      leftRef.current?.stepFrame(direction),
      rightRef.current?.stepFrame(direction),
    ]);
  }, [leftRef, rightRef, isPlaying, pauseBoth]);

  const cycleSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate as typeof PLAYBACK_SPEEDS[number]);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newRate = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackRate(newRate);
    leftRef.current?.setRate(newRate);
    rightRef.current?.setRate(newRate);
  }, [leftRef, rightRef, playbackRate]);

  const setLeftSyncPoint = useCallback((positionMs: number) => {
    setSyncState((prev) => ({ ...prev, leftSyncPointMs: positionMs }));
  }, []);

  const setRightSyncPoint = useCallback((positionMs: number) => {
    setSyncState((prev) => ({ ...prev, rightSyncPointMs: positionMs }));
  }, []);

  const clearSync = useCallback(() => {
    setSyncState({ leftSyncPointMs: null, rightSyncPointMs: null });
  }, []);

  const seekWithSync = useCallback(async (panel: 'left' | 'right', positionMs: number) => {
    const sourceRef = panel === 'left' ? leftRef : rightRef;
    const targetRef = panel === 'left' ? rightRef : leftRef;

    await sourceRef.current?.seekTo(positionMs);

    const targetPosition = computeSyncedPosition(positionMs, offsetMs, panel);
    if (targetPosition !== null && targetRef.current) {
      await targetRef.current.seekTo(targetPosition);
    }
  }, [leftRef, rightRef, offsetMs]);

  const seekOther = useCallback(async (sourcePanel: 'left' | 'right', sourcePositionMs: number) => {
    if (!isSynced) return;
    const targetRef = sourcePanel === 'left' ? rightRef : leftRef;
    const targetPosition = computeSyncedPosition(sourcePositionMs, offsetMs, sourcePanel);
    if (targetPosition !== null && targetRef.current) {
      await targetRef.current.seekTo(targetPosition);
    }
  }, [leftRef, rightRef, isSynced, offsetMs]);

  const resetSlot = useCallback((panel: 'left' | 'right') => {
    setSyncState((prev) => ({
      ...prev,
      [panel === 'left' ? 'leftSyncPointMs' : 'rightSyncPointMs']: null,
    }));
  }, []);

  return {
    isPlaying,
    playbackRate,
    syncState,
    isSynced,
    playBoth,
    pauseBoth,
    togglePlayBoth,
    stepBoth,
    cycleSpeed,
    setLeftSyncPoint,
    setRightSyncPoint,
    clearSync,
    seekWithSync,
    seekOther,
    resetSlot,
  };
};
