/**
 * Background upload queue for cloud clip backup.
 *
 * Singleton queue that uploads clips one at a time (bandwidth-limited).
 * Persists pending items to AsyncStorage so uploads resume after app restart.
 *
 * Requires `setTokenGetter()` and `setProChecker()` before processing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getClip, updateClip } from '@/src/services/recording/clip-storage';
import { getSession } from '@/src/services/session/session-storage';
import { createApiClient } from './api-client';
import { ensureCloudSession, ensureUnsortedSession } from './session-sync';
import { emitUploadEvent } from './upload-events';

const QUEUE_STORAGE_KEY = '@divot/upload_queue';

type QueueItem = {
  clipId: string;
  clipPath: string;
  enqueuedAt: number;
};

let queue: QueueItem[] = [];
let isProcessing = false;
let initialized = false;

let tokenGetter: (() => Promise<string | null>) | null = null;
let proChecker: (() => boolean) | null = null;
let backupEnabledChecker: (() => boolean) | null = null;

/** Configure the auth token getter (from Clerk). */
export const setTokenGetter = (getter: () => Promise<string | null>): void => {
  tokenGetter = getter;
};

/** Get the current token getter (for reuse by other modules like storage usage). */
export const getTokenGetter = (): (() => Promise<string | null>) | null => tokenGetter;

/** Configure the Pro subscription checker. */
export const setProChecker = (checker: () => boolean): void => {
  proChecker = checker;
  // If we have pending items and just became configured, try processing
  if (initialized && queue.length > 0 && !isProcessing) {
    processNext();
  }
};

/** Configure the cloud backup enabled checker (from settings). */
export const setBackupEnabledChecker = (checker: () => boolean): void => {
  backupEnabledChecker = checker;
};

/** Persist the current queue to AsyncStorage. */
const persistQueue = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[UploadQueue] Failed to persist queue:', err);
  }
};

/** Load persisted queue from storage and resume processing. */
const initialize = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;

  try {
    const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (data) {
      queue = JSON.parse(data) as QueueItem[];
      if (queue.length > 0) {
        console.log(`[UploadQueue] Restored ${queue.length} pending items`);
        processNext();
      }
    }
  } catch (err) {
    console.error('[UploadQueue] Failed to load queue:', err);
  }
};

/** Process the next item in the queue. */
const processNext = async (): Promise<void> => {
  if (isProcessing || queue.length === 0) return;

  // Skip silently if not Pro, not authenticated, or backup disabled
  if (!tokenGetter || !proChecker || !proChecker()) {
    return;
  }
  if (backupEnabledChecker && !backupEnabledChecker()) {
    return;
  }

  isProcessing = true;
  const item = queue[0];

  console.log(`[UploadQueue] Processing clipId=${item.clipId}`);
  emitUploadEvent('started', { clipId: item.clipId });

  try {
    const apiClient = createApiClient(tokenGetter);

    // 1. Load local clip metadata
    const clip = await getClip(item.clipId);
    if (!clip) {
      throw new Error('Clip not found locally');
    }

    // 2. Check quota
    const usage = await apiClient.getStorageUsage();
    if (usage.usedBytes + clip.fileSize > usage.quotaBytes) {
      console.warn(`[UploadQueue] Quota exceeded for clipId=${item.clipId}`);
      emitUploadEvent('quota_exceeded', { clipId: item.clipId, error: 'Storage quota exceeded' });
      // Remove from queue — no point retrying until user frees space
      queue.shift();
      await persistQueue();
      isProcessing = false;
      processNext();
      return;
    }

    // 3. Ensure cloud session exists
    let cloudSessionId: string;
    if (clip.sessionId) {
      const localSession = await getSession(clip.sessionId);
      if (localSession) {
        cloudSessionId = await ensureCloudSession(apiClient, localSession);
      } else {
        cloudSessionId = await ensureUnsortedSession(apiClient);
      }
    } else {
      cloudSessionId = await ensureUnsortedSession(apiClient);
    }

    // 4. Create cloud clip record
    const cloudClip = await apiClient.createClip({
      sessionId: cloudSessionId,
      fileSize: clip.fileSize,
      durationSeconds: clip.duration,
      fps: clip.fps,
      name: clip.name ?? null,
      cameraAngle: clip.cameraAngle ?? null,
    });

    // 5. Get presigned upload URL
    const { url: presignedUrl, storageKey } = await apiClient.getUploadUrl(cloudClip.id);

    // 6. Upload video file to R2 via presigned URL
    await FileSystem.uploadAsync(presignedUrl, item.clipPath, {
      httpMethod: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    // 7. Update cloud clip with storage key
    await apiClient.updateClip(cloudClip.id, { storageKey });

    // 8. Update local clip metadata
    await updateClip(item.clipId, {
      cloudClipId: cloudClip.id,
      syncStatus: 'synced',
    });

    console.log(`[UploadQueue] Upload complete for clipId=${item.clipId}`);
    emitUploadEvent('completed', { clipId: item.clipId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Upload failed';
    console.error(`[UploadQueue] Failed for clipId=${item.clipId}:`, errorMessage);
    emitUploadEvent('failed', { clipId: item.clipId, error: errorMessage });

    // Mark local clip as failed
    await updateClip(item.clipId, { syncStatus: 'failed' }).catch(() => {});
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
 * Enqueue a clip for background cloud upload.
 * Deduplicates — if the clip is already queued, it won't be added again.
 */
export const enqueueUpload = async (clipId: string, clipPath: string): Promise<void> => {
  await initialize();

  // Skip if not Pro or backup disabled
  if (!proChecker || !proChecker()) {
    return;
  }
  if (backupEnabledChecker && !backupEnabledChecker()) {
    return;
  }

  // Deduplicate
  if (queue.some((item) => item.clipId === clipId)) {
    return;
  }

  // Mark as pending
  await updateClip(clipId, { syncStatus: 'pending' });

  queue.push({
    clipId,
    clipPath,
    enqueuedAt: Date.now(),
  });

  await persistQueue();
  console.log(`[UploadQueue] Enqueued clipId=${clipId}, queue depth=${queue.length}`);

  processNext();
};

/** Get the current queue length for UI. */
export const getUploadQueueLength = (): number => queue.length;

/** Check if a clip is currently queued for upload. */
export const isClipUploadQueued = (clipId: string): boolean =>
  queue.some((item) => item.clipId === clipId);

// Auto-initialize on import
initialize();
