import { useState, useCallback, useRef, useEffect } from 'react';
import {
  exportAnnotatedVideo,
  cancelExport,
  saveExportToGallery,
  shareExport,
  cleanupExportFiles,
  writeOverlayPng,
  getExportOutputPath,
  CancelledError,
} from '@/src/services/export';

type ExportStatus = 'idle' | 'preparing' | 'encoding' | 'complete' | 'error' | 'cancelled';

type UseVideoExportOptions = {
  /** Path to the source video file. */
  videoPath: string;
  /** Video duration in milliseconds. */
  durationMs: number;
  /** Native video width. */
  videoWidth?: number;
  /** Native video height. */
  videoHeight?: number;
};

type UseVideoExportReturn = {
  /** Current export status. */
  status: ExportStatus;
  /** Encoding progress fraction 0-1. */
  progress: number;
  /** Path to the exported video (when complete). */
  outputPath: string | null;
  /** Error message if export failed. */
  errorMessage: string | null;
  /** Start the export. Optionally provide a callback that returns the overlay PNG as base64.
   *  When omitted, the video is exported without an overlay (straight copy). */
  startExport: (getOverlayBase64?: () => Promise<string>) => Promise<void>;
  /** Cancel a running export. */
  cancel: () => void;
  /** Save the completed export to the photo gallery. */
  saveToGallery: () => Promise<void>;
  /** Share the completed export via the native share sheet. */
  share: () => Promise<void>;
  /** Reset to idle state and clean up temp files. */
  reset: () => void;
};

/**
 * Hook managing the video export lifecycle.
 * Handles overlay PNG generation, FFmpeg encoding, progress, cancellation, and cleanup.
 *
 * Excluded from barrel export — has native dependency (ffmpeg-kit-react-native).
 * Import directly: import { useVideoExport } from '@/src/hooks/use-video-export';
 */
export const useVideoExport = ({
  videoPath,
  durationMs,
  videoWidth,
  videoHeight,
}: UseVideoExportOptions): UseVideoExportReturn => {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const tempFilesRef = useRef<string[]>([]);

  const cleanup = useCallback(() => {
    cleanupExportFiles(tempFilesRef.current);
    tempFilesRef.current = [];
  }, []);

  // Clean up temp files on unmount
  useEffect(() => {
    return () => {
      cleanupExportFiles(tempFilesRef.current);
    };
  }, []);

  const startExport = useCallback(async (getOverlayBase64?: () => Promise<string>) => {
    setStatus('preparing');
    setProgress(0);
    setErrorMessage(null);
    setOutputPath(null);
    cleanup();

    try {
      let overlayPath: string | undefined;
      const exportOutputPath = getExportOutputPath();

      if (getOverlayBase64) {
        // Generate overlay PNG from SVG
        const base64 = await getOverlayBase64();
        overlayPath = await writeOverlayPng(base64);
        tempFilesRef.current = [overlayPath, exportOutputPath];
      } else {
        tempFilesRef.current = [exportOutputPath];
      }

      setStatus('encoding');

      const { sessionId } = await exportAnnotatedVideo({
        videoPath,
        overlayPngPath: overlayPath,
        outputPath: exportOutputPath,
        durationMs,
        onProgress: setProgress,
        videoWidth,
        videoHeight,
      });

      sessionIdRef.current = sessionId;
      setOutputPath(exportOutputPath);
      setProgress(1);
      setStatus('complete');
    } catch (error) {
      if (error instanceof CancelledError) {
        setStatus('cancelled');
      } else {
        const message = error instanceof Error ? error.message : 'Export failed';
        setErrorMessage(message);
        setStatus('error');
      }
    }
  }, [videoPath, durationMs, videoWidth, videoHeight, cleanup]);

  const cancel = useCallback(() => {
    if (sessionIdRef.current !== null) {
      cancelExport(sessionIdRef.current);
    }
    setStatus('cancelled');
  }, []);

  const saveToGallery = useCallback(async () => {
    if (!outputPath) return;
    try {
      await saveExportToGallery(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      setErrorMessage(message);
      setStatus('error');
    }
  }, [outputPath]);

  const share = useCallback(async () => {
    if (!outputPath) return;
    try {
      await shareExport(outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Share failed';
      setErrorMessage(message);
      setStatus('error');
    }
  }, [outputPath]);

  const reset = useCallback(() => {
    cleanup();
    sessionIdRef.current = null;
    setStatus('idle');
    setProgress(0);
    setOutputPath(null);
    setErrorMessage(null);
  }, [cleanup]);

  return { status, progress, outputPath, errorMessage, startExport, cancel, saveToGallery, share, reset };
};
