/**
 * Pure sync offset utilities for compare view.
 */

/**
 * Computes the sync offset between two video panels.
 * Positive offset means the right panel's sync point is ahead of the left's.
 */
export const computeSyncOffset = (
  leftSyncPointMs: number | null,
  rightSyncPointMs: number | null,
): number | null => {
  if (leftSyncPointMs === null || rightSyncPointMs === null) return null;
  return rightSyncPointMs - leftSyncPointMs;
};

/**
 * Given a source position and sync offset, computes the target panel's position.
 * Returns null if sync is not active.
 */
export const computeSyncedPosition = (
  sourcePosition: number,
  offsetMs: number | null,
  sourcePanel: 'left' | 'right',
  targetDurationMs?: number,
): number | null => {
  if (offsetMs === null) return null;

  const targetPosition = sourcePanel === 'left'
    ? sourcePosition + offsetMs
    : sourcePosition - offsetMs;

  const clamped = Math.max(0, targetDurationMs !== undefined
    ? Math.min(targetPosition, targetDurationMs)
    : targetPosition);

  return clamped;
};

/**
 * Formats ms to compact M:SS display.
 */
export const formatTimeCompact = (millis: number): string => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
