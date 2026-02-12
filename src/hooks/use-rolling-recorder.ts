import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type { VideoFile } from 'react-native-vision-camera';
import type { VisionCameraRecorderRef } from '@/src/components/recording/vision-camera-recorder';
import type { Clip } from '@/src/types/recording';
import { saveClip } from '@/src/services/recording/clip-storage';
import { DEFAULT_SWING_DETECTION_CONFIG } from '@/src/utils/swing-detection';

/**
 * Internal states for the rolling recorder:
 * - `idle`: not buffering (auto-detect off or camera not previewing)
 * - `buffering`: continuously recording short segments, cycling on timer
 * - `transitioning`: between cancelRecording and the next startRecording
 * - `capturing`: swing detected, current segment kept (no more cycling)
 * - `post-rolling`: swing ended, waiting postRollDurationMs before stopping
 */
export type RollingRecorderState =
  | 'idle'
  | 'buffering'
  | 'transitioning'
  | 'capturing'
  | 'post-rolling';

export type UseRollingRecorderOptions = {
  /** Ref to the VisionCamera recorder component. */
  recorderRef: RefObject<VisionCameraRecorderRef | null>;
  /** Whether rolling recording should be active (auto-detect armed + camera previewing). */
  enabled: boolean;
  /** Duration to continue recording after swing ends. Defaults to config value (3000ms). */
  postRollDurationMs?: number;
  /** Max duration of each buffer segment before cycling. Defaults to 8000ms. */
  maxSegmentDurationMs?: number;
  /** Recording fps for clip metadata. */
  recordingFps?: number;
  /** Session ID for saved clips. */
  sessionId?: string | null;
  /** Called when a clip is saved after post-roll completes. */
  onClipSaved: (clip: Clip) => void;
  /** Called on recording errors (non-cancel). */
  onError?: (error: string) => void;
};

export type UseRollingRecorderReturn = {
  /** Whether the recorder is actively buffering. */
  isBuffering: boolean;
  /** Notify the recorder that a swing has started. */
  notifySwingStarted: () => void;
  /** Notify the recorder that a swing has ended. */
  notifySwingEnded: () => void;
  /** Suspend rolling recording (e.g. for manual record). */
  suspend: () => void;
  /** Resume rolling recording after suspension. */
  resume: () => void;
};

/**
 * Rolling buffer recorder for swing auto-detection.
 *
 * Continuously records short video segments when enabled, cycling
 * (cancel + restart) every `maxSegmentDurationMs`. When a swing is
 * detected, stops cycling and keeps the current segment. After
 * `postRollDurationMs`, stops recording and saves the clip.
 *
 * Pre-roll is natural — the current segment was already recording
 * before the swing was detected.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useRollingRecorder } from '@/src/hooks/use-rolling-recorder'`
 */
export const useRollingRecorder = ({
  recorderRef,
  enabled,
  postRollDurationMs = DEFAULT_SWING_DETECTION_CONFIG.postRollDurationMs,
  maxSegmentDurationMs = 8000,
  recordingFps = 30,
  sessionId = null,
  onClipSaved,
  onError,
}: UseRollingRecorderOptions): UseRollingRecorderReturn => {
  // All mutable state in refs to avoid stale closures in recording callbacks
  const stateRef = useRef<RollingRecorderState>('idle');
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postRollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendedRef = useRef(false);
  const segmentStartTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Keep latest callback refs to avoid stale closures
  const onClipSavedRef = useRef(onClipSaved);
  onClipSavedRef.current = onClipSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const recordingFpsRef = useRef(recordingFps);
  recordingFpsRef.current = recordingFps;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const postRollMsRef = useRef(postRollDurationMs);
  postRollMsRef.current = postRollDurationMs;

  const clearCycleTimer = useCallback(() => {
    if (cycleTimerRef.current !== null) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
  }, []);

  const clearPostRollTimer = useCallback(() => {
    if (postRollTimerRef.current !== null) {
      clearTimeout(postRollTimerRef.current);
      postRollTimerRef.current = null;
    }
  }, []);

  /**
   * Start a new buffer segment. Handles the recording callbacks internally.
   */
  const startBufferSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !mountedRef.current) return;

    segmentStartTimeRef.current = Date.now();
    stateRef.current = 'buffering';

    recorder.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        if (!mountedRef.current) return;

        // Only save when we're in post-rolling → this is the keeper segment
        if (stateRef.current === 'post-rolling' || stateRef.current === 'capturing') {
          const duration = Math.round((Date.now() - segmentStartTimeRef.current) / 1000);
          try {
            const clip = await saveClip({
              path: video.path,
              duration,
              fps: recordingFpsRef.current,
              sessionId: sessionIdRef.current ?? undefined,
            });
            stateRef.current = 'idle';
            onClipSavedRef.current(clip);

            // Re-arm buffering if still enabled and not suspended
            if (enabled && !suspendedRef.current && mountedRef.current) {
              startBufferSegment();
            }
          } catch (err) {
            stateRef.current = 'idle';
            const msg = err instanceof Error ? err.message : 'Failed to save clip';
            onErrorRef.current?.(msg);
          }
        }
        // If state is 'transitioning', the segment was cycled — file is auto-discarded by cancel
      },
      onRecordingError: (error: unknown) => {
        if (!mountedRef.current) return;

        // cancelRecording() triggers onRecordingError with code 'capture/recording-canceled'
        const errorObj = error as { code?: string; message?: string };
        if (errorObj?.code === 'capture/recording-canceled') {
          // Expected during cycling — not a real error
          return;
        }

        // Real error
        const msg = errorObj?.message ?? 'Recording failed';
        stateRef.current = 'idle';
        clearCycleTimer();
        clearPostRollTimer();
        onErrorRef.current?.(msg);
      },
    });

    // Schedule the next cycle
    clearCycleTimer();
    cycleTimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'buffering' || !mountedRef.current) return;

      stateRef.current = 'transitioning';
      recorder.cancelRecording().then(() => {
        if (!mountedRef.current || suspendedRef.current) return;
        if (stateRef.current === 'transitioning') {
          startBufferSegment();
        }
      }).catch(() => {
        // cancelRecording failed — try to restart
        if (mountedRef.current && !suspendedRef.current && stateRef.current === 'transitioning') {
          startBufferSegment();
        }
      });
    }, maxSegmentDurationMs);
  }, [recorderRef, enabled, maxSegmentDurationMs, clearCycleTimer, clearPostRollTimer]);

  /** Stop all recording and clean up timers. */
  const stopAll = useCallback(() => {
    clearCycleTimer();
    clearPostRollTimer();

    const currentState = stateRef.current;
    stateRef.current = 'idle';

    if (currentState === 'buffering' || currentState === 'capturing' || currentState === 'post-rolling') {
      recorderRef.current?.cancelRecording().catch(() => {});
    }
  }, [recorderRef, clearCycleTimer, clearPostRollTimer]);

  // Enable/disable rolling recording based on `enabled` prop
  useEffect(() => {
    if (enabled && !suspendedRef.current) {
      if (stateRef.current === 'idle') {
        startBufferSegment();
      }
    } else {
      stopAll();
    }
  }, [enabled, startBufferSegment, stopAll]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearCycleTimer();
      clearPostRollTimer();
      // Cancel any active recording on unmount
      const currentState = stateRef.current;
      if (currentState === 'buffering' || currentState === 'capturing' || currentState === 'post-rolling') {
        recorderRef.current?.cancelRecording().catch(() => {});
      }
      stateRef.current = 'idle';
    };
  }, []);

  const notifySwingStarted = useCallback(() => {
    const currentState = stateRef.current;

    if (currentState === 'buffering') {
      // Stop cycling — keep current segment recording
      clearCycleTimer();
      stateRef.current = 'capturing';
    } else if (currentState === 'transitioning') {
      // We're between segments — start a fresh capture segment
      // (pre-roll is lost but the swing itself will be captured)
      stateRef.current = 'capturing';
      // The transitioning flow will call startBufferSegment which checks state;
      // since we're now 'capturing', we need to start fresh
      const recorder = recorderRef.current;
      if (recorder) {
        segmentStartTimeRef.current = Date.now();
        recorder.startRecording({
          onRecordingFinished: async (video: VideoFile) => {
            if (!mountedRef.current) return;
            const duration = Math.round((Date.now() - segmentStartTimeRef.current) / 1000);
            try {
              const clip = await saveClip({
                path: video.path,
                duration,
                fps: recordingFpsRef.current,
                sessionId: sessionIdRef.current ?? undefined,
              });
              stateRef.current = 'idle';
              onClipSavedRef.current(clip);
              if (enabled && !suspendedRef.current && mountedRef.current) {
                startBufferSegment();
              }
            } catch (err) {
              stateRef.current = 'idle';
              const msg = err instanceof Error ? err.message : 'Failed to save clip';
              onErrorRef.current?.(msg);
            }
          },
          onRecordingError: (error: unknown) => {
            if (!mountedRef.current) return;
            const errorObj = error as { code?: string; message?: string };
            if (errorObj?.code === 'capture/recording-canceled') return;
            stateRef.current = 'idle';
            onErrorRef.current?.(errorObj?.message ?? 'Recording failed');
          },
        });
      }
    }
    // If idle or already capturing/post-rolling, ignore
  }, [recorderRef, enabled, clearCycleTimer, startBufferSegment]);

  const notifySwingEnded = useCallback(() => {
    if (stateRef.current !== 'capturing') return;

    stateRef.current = 'post-rolling';

    clearPostRollTimer();
    postRollTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (stateRef.current !== 'post-rolling') return;

      // Stop recording — onRecordingFinished will save the clip
      recorderRef.current?.stopRecording().catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to stop recording';
        stateRef.current = 'idle';
        onErrorRef.current?.(msg);
      });
    }, postRollMsRef.current);
  }, [recorderRef, clearPostRollTimer]);

  const suspend = useCallback(() => {
    suspendedRef.current = true;
    stopAll();
  }, [stopAll]);

  const resume = useCallback(() => {
    suspendedRef.current = false;
    if (enabled && stateRef.current === 'idle') {
      startBufferSegment();
    }
  }, [enabled, startBufferSegment]);

  return {
    isBuffering: stateRef.current !== 'idle',
    notifySwingStarted,
    notifySwingEnded,
    suspend,
    resume,
  };
};
