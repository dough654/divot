import { useState, useEffect, useCallback, useRef } from 'react';
import { SwingAnalysisModule } from '../../modules/swing-analysis/src';
import type { SwingAnalysisResult, AnalysisProgressEvent } from '../../modules/swing-analysis/src/types';
import { saveAnalysis, loadAnalysis } from '@/src/services/analysis/analysis-storage';

type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error' | 'cancelled';

type UseSwingAnalysisOptions = {
  /** Clip ID to load/save analysis for. */
  clipId: string;
  /** File path to the clip video (needed for native analysis). */
  clipPath: string;
};

type UseSwingAnalysisReturn = {
  /** Current status of the analysis. */
  status: AnalysisStatus;
  /** Progress fraction 0-1 while analyzing. */
  progress: number;
  /** Analysis result, if complete. */
  result: SwingAnalysisResult | null;
  /** Error message if analysis failed. */
  errorMessage: string | null;
  /** Start or re-run analysis. */
  analyze: () => Promise<void>;
  /** Cancel a running analysis. */
  cancel: () => void;
};

/**
 * Hook managing the swing analysis lifecycle for a clip.
 * Loads existing results from storage on mount, provides analyze/cancel controls,
 * and saves results on completion.
 *
 * Excluded from barrel export — has native dependency.
 * Import directly: import { useSwingAnalysis } from '@/src/hooks/use-swing-analysis';
 */
export const useSwingAnalysis = ({
  clipId,
  clipPath,
}: UseSwingAnalysisOptions): UseSwingAnalysisReturn => {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SwingAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);

  // Load existing analysis on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const persisted = await loadAnalysis(clipId);
      if (!cancelled && persisted) {
        setResult(persisted.result);
        setStatus('complete');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [clipId]);

  const analyze = useCallback(async () => {
    if (!SwingAnalysisModule) {
      setErrorMessage('Swing analysis is not available on this platform');
      setStatus('error');
      return;
    }

    setStatus('analyzing');
    setProgress(0);
    setErrorMessage(null);

    // Subscribe to progress events
    const module = SwingAnalysisModule as unknown as {
      addListener: (eventName: string, callback: (event: AnalysisProgressEvent) => void) => { remove: () => void };
      analyzeClip: (filePath: string, clipId: string) => Promise<SwingAnalysisResult>;
    };

    listenerRef.current = module.addListener('onAnalysisProgress', (event: AnalysisProgressEvent) => {
      setProgress(event.progress);
    });

    try {
      const analysisResult = await module.analyzeClip(clipPath, clipId);
      setResult(analysisResult);
      setStatus('complete');
      saveAnalysis(clipId, analysisResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      if (message.includes('cancelled')) {
        setStatus('cancelled');
      } else {
        setErrorMessage(message);
        setStatus('error');
      }
    } finally {
      listenerRef.current?.remove();
      listenerRef.current = null;
    }
  }, [clipId, clipPath]);

  const cancel = useCallback(() => {
    SwingAnalysisModule?.cancelAnalysis();
    setStatus('cancelled');
  }, []);

  return { status, progress, result, errorMessage, analyze, cancel };
};
