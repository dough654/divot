/**
 * Background analysis queue for video pose analysis.
 *
 * Singleton queue that processes clips one at a time (GPU-intensive).
 * Persists pending items to AsyncStorage so analysis resumes after app restart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { VideoPoseAnalysisModule } from '../../../modules/video-pose-analysis/src';
import type { VideoPoseAnalysisResult } from '../../../modules/video-pose-analysis/src/types';
import { savePoseAnalysis } from './analysis-storage';
import { updateClip } from '../recording/clip-storage';
import { calculateTempoFromPoseFrames } from '@/src/utils/video-pose-tempo';
import { emitAnalysisEvent } from './analysis-events';

const QUEUE_STORAGE_KEY = '@divot/analysis_queue';

type QueueItem = {
  clipId: string;
  clipPath: string;
  enqueuedAt: number;
};

let queue: QueueItem[] = [];
let isProcessing = false;
let initialized = false;

/** Load persisted queue from storage and resume processing. */
const initialize = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;

  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (data) {
      queue = JSON.parse(data) as QueueItem[];
      if (queue.length > 0) {
        console.log(`[AnalysisQueue] Restored ${queue.length} pending items`);
        processNext();
      }
    }
  } catch (err) {
    console.error('[AnalysisQueue] Failed to load queue:', err);
  }
};

/** Persist the current queue to AsyncStorage. */
const persistQueue = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[AnalysisQueue] Failed to persist queue:', err);
  }
};

/** Process the next item in the queue. */
const processNext = async (): Promise<void> => {
  if (isProcessing || queue.length === 0) return;

  isProcessing = true;
  const item = queue[0];

  console.log(`[AnalysisQueue] Processing clipId=${item.clipId}`);
  emitAnalysisEvent('started', { clipId: item.clipId });

  try {
    const result: VideoPoseAnalysisResult = await VideoPoseAnalysisModule.analyzeVideo(
      item.clipPath,
      item.clipId,
    );

    console.log(
      `[AnalysisQueue] Analysis complete: ${result.analyzedFrames}/${result.totalFrames} frames in ${Math.round(result.analysisTimeMs)}ms (${result.fps.toFixed(0)} fps, ${result.resolution.width}x${result.resolution.height})`,
    );

    // Save detailed pose data
    savePoseAnalysis(item.clipId, result);

    // Calculate tempo from pose frames and update clip metadata
    const tempo = calculateTempoFromPoseFrames(result.frames, result.fps);
    if (tempo) {
      await updateClip(item.clipId, {
        tempoRatio: tempo.tempoRatio,
        backswingDurationMs: tempo.backswingDurationMs,
        downswingDurationMs: tempo.downswingDurationMs,
        takeawayTimestampMs: tempo.takeawayTimestampMs,
        peakTimestampMs: tempo.peakTimestampMs,
        impactTimestampMs: tempo.impactTimestampMs,
      });
      console.log(`[AnalysisQueue] Tempo: ${tempo.tempoRatio.toFixed(1)}:1 (backswing=${tempo.backswingDurationMs}ms, downswing=${tempo.downswingDurationMs}ms)`);
    } else {
      console.warn(`[AnalysisQueue] No tempo detected from ${result.analyzedFrames} pose frames`);
    }

    emitAnalysisEvent('completed', { clipId: item.clipId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
    console.error(`[AnalysisQueue] Failed for clipId=${item.clipId}:`, errorMessage);
    emitAnalysisEvent('failed', { clipId: item.clipId, error: errorMessage });
  }

  // Remove processed item and persist
  queue.shift();
  await persistQueue();
  isProcessing = false;

  // Process next if any
  if (queue.length > 0) {
    processNext();
  }
};

/**
 * Enqueue a clip for background pose analysis.
 * Deduplicates — if the clip is already queued, it won't be added again.
 */
export const enqueueAnalysis = async (clipId: string, clipPath: string): Promise<void> => {
  console.log(`[AnalysisQueue] enqueueAnalysis called: clipId=${clipId}, path=${clipPath}`);
  await initialize();

  // Deduplicate
  if (queue.some((item) => item.clipId === clipId)) {
    console.log(`[AnalysisQueue] clipId=${clipId} already queued, skipping`);
    return;
  }

  queue.push({
    clipId,
    clipPath,
    enqueuedAt: Date.now(),
  });

  await persistQueue();
  console.log(`[AnalysisQueue] Enqueued clipId=${clipId}, queue depth=${queue.length}`);

  processNext();
};

/** Cancel analysis for a specific clip (removes from queue or cancels if active). */
export const cancelAnalysis = async (clipId: string): Promise<void> => {
  const activeItem = queue[0];
  if (activeItem && activeItem.clipId === clipId && isProcessing) {
    VideoPoseAnalysisModule.cancelAnalysis();
  }

  queue = queue.filter((item) => item.clipId !== clipId);
  await persistQueue();
};

/** Get the current queue for debugging/UI. */
export const getAnalysisQueue = (): readonly QueueItem[] => {
  return queue;
};

/** Check if a clip is currently being analyzed or is queued. */
export const isClipQueued = (clipId: string): boolean => {
  return queue.some((item) => item.clipId === clipId);
};

// Auto-initialize on import
initialize();
