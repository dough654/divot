/**
 * Hook for fetching cloud storage usage from the API.
 *
 * Returns usage stats (bytes used, quota, clip count) for the
 * authenticated user. Only fetches when a valid token getter is available.
 */
import { useState, useEffect, useCallback } from 'react';
import { createApiClient } from '@/src/services/cloud/api-client';
import { getTokenGetter } from '@/src/services/cloud/upload-queue';

type StorageUsageResult = {
  usedBytes: number;
  quotaBytes: number;
  clipCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export const useStorageUsage = ({ enabled }: { enabled: boolean }): StorageUsageResult => {
  const [usedBytes, setUsedBytes] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState(0);
  const [clipCount, setClipCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const tokenGetter = getTokenGetter();
    if (!tokenGetter) return;

    let cancelled = false;
    const fetchUsage = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const apiClient = createApiClient(tokenGetter);
        const usage = await apiClient.getStorageUsage();
        if (cancelled) return;
        setUsedBytes(usage.usedBytes);
        setQuotaBytes(usage.quotaBytes);
        setClipCount(usage.clipCount);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch storage usage');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchUsage();
    return () => { cancelled = true; };
  }, [enabled, refreshKey]);

  return { usedBytes, quotaBytes, clipCount, isLoading, error, refresh };
};
