/**
 * Hook for consuming cloud upload status.
 *
 * Subscribes to upload events for real-time reactivity.
 * Excluded from hooks barrel — import directly:
 * `import { useCloudSync } from '@/src/hooks/use-cloud-sync'`
 */

import { useState, useEffect, useRef } from 'react';
import { onUploadEvent } from '@/src/services/cloud/upload-events';
import { getUploadQueueLength } from '@/src/services/cloud/upload-queue';

type CloudSyncState = {
  /** Whether an upload is currently in progress. */
  isSyncing: boolean;
  /** Number of clips waiting to be uploaded. */
  pendingCount: number;
  /** Number of clips that failed to upload in this session. */
  failedCount: number;
};

/**
 * Provides reactive access to the cloud upload queue status.
 */
export const useCloudSync = (): CloudSyncState => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(getUploadQueueLength);
  const [failedCount, setFailedCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const unsubStarted = onUploadEvent('started', () => {
      if (!mountedRef.current) return;
      setIsSyncing(true);
      setPendingCount(getUploadQueueLength());
    });

    const unsubCompleted = onUploadEvent('completed', () => {
      if (!mountedRef.current) return;
      const remaining = getUploadQueueLength();
      setPendingCount(remaining);
      setIsSyncing(remaining > 0);
    });

    const unsubFailed = onUploadEvent('failed', () => {
      if (!mountedRef.current) return;
      setFailedCount((c) => c + 1);
      const remaining = getUploadQueueLength();
      setPendingCount(remaining);
      setIsSyncing(remaining > 0);
    });

    const unsubQuota = onUploadEvent('quota_exceeded', () => {
      if (!mountedRef.current) return;
      setFailedCount((c) => c + 1);
      const remaining = getUploadQueueLength();
      setPendingCount(remaining);
      setIsSyncing(remaining > 0);
    });

    return () => {
      mountedRef.current = false;
      unsubStarted();
      unsubCompleted();
      unsubFailed();
      unsubQuota();
    };
  }, []);

  return { isSyncing, pendingCount, failedCount };
};
