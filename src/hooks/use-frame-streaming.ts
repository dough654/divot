import { useState, useEffect, useRef, useCallback } from 'react';
import type { VisionCameraRecorderRef } from '@/src/components/recording';
import type { DataChannel } from '@/src/services/webrtc';

const DEFAULT_TARGET_FPS = 12;
const DEFAULT_QUALITY = 30;

export type UseFrameStreamingOptions = {
  /** Ref to the VisionCameraRecorder component */
  recorderRef: React.RefObject<VisionCameraRecorderRef | null>;
  /** WebRTC data channel to send frames over */
  dataChannel: DataChannel | null;
  /** Whether frame streaming is enabled */
  enabled: boolean;
  /** Target frames per second (default: 12) */
  targetFps?: number;
  /** JPEG quality 0-100 (default: 30) */
  quality?: number;
};

export type UseFrameStreamingResult = {
  /** Whether frames are actively being sent */
  isStreaming: boolean;
  /** Measured frames per second being achieved */
  currentFps: number;
  /** Temporarily pause streaming (e.g. during clip sync) */
  pause: () => void;
  /** Resume streaming after pause */
  resume: () => void;
};

/**
 * Captures snapshots from VisionCamera at a target FPS and sends them
 * as base64 JPEG frames over the WebRTC data channel.
 */
export const useFrameStreaming = ({
  recorderRef,
  dataChannel,
  enabled,
  targetFps = DEFAULT_TARGET_FPS,
  quality = DEFAULT_QUALITY,
}: UseFrameStreamingOptions): UseFrameStreamingResult => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentFps, setCurrentFps] = useState(0);

  const isPausedRef = useRef(false);
  const isBusyRef = useRef(false);
  const frameCountRef = useRef(0);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureAndSendFrame = useCallback(async () => {
    if (isBusyRef.current || isPausedRef.current) return;
    if (!recorderRef.current || !dataChannel || dataChannel.readyState !== 'open') return;

    isBusyRef.current = true;

    try {
      const base64Data = await recorderRef.current.takeSnapshot({ quality });

      if (base64Data && dataChannel.readyState === 'open' && !isPausedRef.current) {
        const message = JSON.stringify({
          type: 'PREVIEW_FRAME',
          data: base64Data,
          timestamp: Date.now(),
        });
        dataChannel.send(message);
        frameCountRef.current++;
      }
    } catch {
      // Snapshot failed — skip this frame
    } finally {
      isBusyRef.current = false;
    }
  }, [recorderRef, dataChannel, quality]);

  // Start/stop the capture loop
  useEffect(() => {
    const canStream = enabled && dataChannel?.readyState === 'open';

    if (!canStream) {
      // Clean up
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
        fpsIntervalRef.current = null;
      }
      if (isStreaming && dataChannel?.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'PREVIEW_STOP' }));
      }
      setIsStreaming(false);
      setCurrentFps(0);
      return;
    }

    // Send start signal
    dataChannel.send(JSON.stringify({ type: 'PREVIEW_START' }));
    setIsStreaming(true);
    frameCountRef.current = 0;

    // Capture interval
    const intervalMs = Math.round(1000 / targetFps);
    captureIntervalRef.current = setInterval(captureAndSendFrame, intervalMs);

    // FPS measurement interval (every second)
    fpsIntervalRef.current = setInterval(() => {
      setCurrentFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
        fpsIntervalRef.current = null;
      }
    };
  }, [enabled, dataChannel, targetFps, captureAndSendFrame, isStreaming]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'PREVIEW_STOP' }));
    }
  }, [dataChannel]);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'PREVIEW_START' }));
    }
  }, [dataChannel]);

  return {
    isStreaming,
    currentFps,
    pause,
    resume,
  };
};
