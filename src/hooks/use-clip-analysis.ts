/**
 * Hook for consuming background pose analysis results.
 *
 * Loads existing analysis on mount, subscribes to analysis events
 * for real-time reactivity (analysis completing while viewing a clip).
 *
 * Excluded from hooks barrel — import directly:
 * `import { useClipAnalysis } from '@/src/hooks/use-clip-analysis'`
 */

import { useState, useEffect, useCallback } from 'react';
import { loadPoseAnalysis } from '@/src/services/analysis/analysis-storage';
import { isClipQueued } from '@/src/services/analysis/analysis-queue';
import { onAnalysisEvent } from '@/src/services/analysis/analysis-events';
import { getClip } from '@/src/services/recording/clip-storage';
import type { SwingTempo } from '@/src/utils/swing-tempo';

type ClipAnalysisStatus = 'loading' | 'pending' | 'analyzing' | 'complete' | 'none';

type ClipAnalysisResult = {
  /** Current analysis status. */
  status: ClipAnalysisStatus;
  /** Tempo data from background analysis, if available. */
  tempo: SwingTempo | null;
  /** Refresh analysis data (e.g. after navigating back). */
  refresh: () => void;
};

/**
 * Provides reactive access to a clip's background analysis results.
 *
 * Checks clip metadata for already-computed tempo, checks the analysis queue
 * for pending/in-progress status, and subscribes to completion events.
 */
export const useClipAnalysis = (clipId: string | null): ClipAnalysisResult => {
  const [status, setStatus] = useState<ClipAnalysisStatus>('loading');
  const [tempo, setTempo] = useState<SwingTempo | null>(null);

  const loadData = useCallback(async () => {
    if (!clipId) {
      setStatus('none');
      setTempo(null);
      return;
    }

    // First check clip metadata for already-computed tempo
    const clip = await getClip(clipId);
    if (clip?.tempoRatio != null && clip.backswingDurationMs != null && clip.downswingDurationMs != null) {
      setTempo({
        tempoRatio: clip.tempoRatio,
        backswingDurationMs: clip.backswingDurationMs,
        downswingDurationMs: clip.downswingDurationMs,
      });
      setStatus('complete');
      return;
    }

    // Check if analysis exists on disk but tempo wasn't saved to clip
    const poseAnalysis = await loadPoseAnalysis(clipId);
    if (poseAnalysis) {
      setStatus('complete');
      // Tempo should already be in clip metadata if analysis completed,
      // but we can still show complete status
      return;
    }

    // Check if queued for analysis
    if (isClipQueued(clipId)) {
      setStatus('analyzing');
      return;
    }

    // No analysis data and not queued
    setStatus('none');
  }, [clipId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to analysis events for this clip
  useEffect(() => {
    if (!clipId) return;

    const unsubStarted = onAnalysisEvent('started', (payload) => {
      if (payload.clipId === clipId) {
        setStatus('analyzing');
      }
    });

    const unsubCompleted = onAnalysisEvent('completed', (payload) => {
      if (payload.clipId === clipId) {
        // Reload data to get computed tempo
        loadData();
      }
    });

    const unsubFailed = onAnalysisEvent('failed', (payload) => {
      if (payload.clipId === clipId) {
        setStatus('none');
      }
    });

    return () => {
      unsubStarted();
      unsubCompleted();
      unsubFailed();
    };
  }, [clipId, loadData]);

  return {
    status,
    tempo,
    refresh: loadData,
  };
};
