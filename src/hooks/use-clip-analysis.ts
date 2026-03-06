/**
 * Hook for consuming background pose analysis results.
 *
 * Loads existing analysis on mount, subscribes to analysis events
 * for real-time reactivity (analysis completing while viewing a clip).
 *
 * Excluded from hooks barrel — import directly:
 * `import { useClipAnalysis } from '@/src/hooks/use-clip-analysis'`
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadPoseAnalysis } from '@/src/services/analysis/analysis-storage';
import { isClipQueued } from '@/src/services/analysis/analysis-queue';
import { onAnalysisEvent } from '@/src/services/analysis/analysis-events';
import { getClip } from '@/src/services/recording/clip-storage';
import type { SwingTempo } from '@/src/utils/swing-tempo';
import type { PoseFrame } from '../../modules/video-pose-analysis/src/types';

type ClipAnalysisStatus = 'loading' | 'pending' | 'analyzing' | 'complete' | 'none';

type ClipAnalysisResult = {
  /** Current analysis status. */
  status: ClipAnalysisStatus;
  /** Tempo data from background analysis, if available. */
  tempo: SwingTempo | null;
  /** Per-frame pose landmarks from background analysis. */
  poseFrames: PoseFrame[] | null;
  /** Resolution the pose analysis was performed at. */
  poseResolution: { width: number; height: number } | null;
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
  const [poseFrames, setPoseFrames] = useState<PoseFrame[] | null>(null);
  const [poseResolution, setPoseResolution] = useState<{ width: number; height: number } | null>(null);
  const mountedRef = useRef(true);

  const loadData = useCallback(async () => {
    if (!clipId) {
      setStatus('none');
      setTempo(null);
      setPoseFrames(null);
      setPoseResolution(null);
      return;
    }

    // First check clip metadata for already-computed tempo
    const clip = await getClip(clipId);
    if (!mountedRef.current) return;

    if (clip?.tempoRatio != null && clip.backswingDurationMs != null && clip.downswingDurationMs != null) {
      setTempo({
        tempoRatio: clip.tempoRatio,
        backswingDurationMs: clip.backswingDurationMs,
        downswingDurationMs: clip.downswingDurationMs,
        takeawayTimestampMs: clip.takeawayTimestampMs,
        peakTimestampMs: clip.peakTimestampMs,
        impactTimestampMs: clip.impactTimestampMs,
      });

      // Also load pose frames even when tempo came from clip metadata
      const poseAnalysis = await loadPoseAnalysis(clipId);
      if (!mountedRef.current) return;
      if (poseAnalysis) {
        setPoseFrames(poseAnalysis.result.frames);
        setPoseResolution(poseAnalysis.result.resolution);
      }

      setStatus('complete');
      return;
    }

    // Check if analysis exists on disk but tempo wasn't saved to clip
    const poseAnalysis = await loadPoseAnalysis(clipId);
    if (!mountedRef.current) return;

    if (poseAnalysis) {
      setPoseFrames(poseAnalysis.result.frames);
      setPoseResolution(poseAnalysis.result.resolution);
      setStatus('complete');
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

  // Subscribe to analysis events FIRST, then load data.
  // This prevents a race where analysis completes between load and subscribe.
  useEffect(() => {
    mountedRef.current = true;

    if (!clipId) {
      setStatus('none');
      setTempo(null);
      setPoseFrames(null);
      setPoseResolution(null);
      return;
    }

    const unsubStarted = onAnalysisEvent('started', (payload) => {
      if (payload.clipId === clipId && mountedRef.current) {
        setStatus('analyzing');
      }
    });

    const unsubCompleted = onAnalysisEvent('completed', (payload) => {
      if (payload.clipId === clipId && mountedRef.current) {
        loadData();
      }
    });

    const unsubFailed = onAnalysisEvent('failed', (payload) => {
      if (payload.clipId === clipId && mountedRef.current) {
        setStatus('none');
      }
    });

    // Now load data — if analysis already completed, we'll find it.
    // If it completes during/after loadData, the event handler above catches it.
    loadData();

    return () => {
      mountedRef.current = false;
      unsubStarted();
      unsubCompleted();
      unsubFailed();
    };
  }, [clipId, loadData]);

  return {
    status,
    tempo,
    poseFrames,
    poseResolution,
    refresh: loadData,
  };
};
