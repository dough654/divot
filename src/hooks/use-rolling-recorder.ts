import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type { VideoFile } from 'react-native-vision-camera';
import type { VisionCameraRecorderRef } from '@/src/components/recording/vision-camera-recorder';
import type { Clip } from '@/src/types/recording';
import { saveClip } from '@/src/services/recording/clip-storage';

/**
 * Internal states for the rolling recorder:
 * - `idle`: not buffering (auto-detect off or camera not previewing)
 * - `buffering`: continuously recording short segments, cycling on timer
 * - `transitioning`: between cancelRecording and the next startRecording
 * - `post-rolling`: swing detected, waiting fixed post-roll before stopping
 */
export type RollingRecorderState =
  | 'idle'
  | 'buffering'
  | 'transitioning'
  | 'post-rolling';

/** Default post-roll duration after swing detection (ms). */
const DEFAULT_POST_ROLL_MS = 1500;

/** Default max duration of each buffer segment before cycling (ms). */
const DEFAULT_MAX_SEGMENT_MS = 4000;

/** Minimum buffer age before accepting swing detection (ms). Ensures meaningful pre-roll. */
const MIN_PRE_ROLL_MS = 2000;

export type UseRollingRecorderOptions = {
  /** Ref to the VisionCamera recorder component. */
  recorderRef: RefObject<VisionCameraRecorderRef | null>;
  /** Whether rolling recording should be active (auto-detect armed + camera previewing). */
  enabled: boolean;
  /** Duration to continue recording after swing detected. Defaults to 1500ms. */
  postRollDurationMs?: number;
  /** Max duration of each buffer segment before cycling. Defaults to 5000ms. */
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
  /** Notify the recorder that a swing has been detected. Returns true if capture started. */
  notifySwingDetected: () => boolean;
  /** Suspend rolling recording (e.g. for manual record). */
  suspend: () => void;
  /** Resume rolling recording after suspension. */
  resume: () => void;
};

/**
 * Rolling buffer recorder with fixed-window swing capture.
 *
 * Continuously records short video segments when enabled, cycling
 * (cancel + restart) every `maxSegmentDurationMs`. When a swing is
 * detected, stops cycling and keeps the current segment recording
 * for `postRollDurationMs`, then stops and saves.
 *
 * Pre-roll is natural — the current segment was already recording
 * before the swing was detected. With 4s segments and a 2s minimum
 * buffer age, pre-roll is 2–4s. Total clip: ~3.5–5.5s.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useRollingRecorder } from '@/src/hooks/use-rolling-recorder'`
 */
export const useRollingRecorder = ({
  recorderRef,
  enabled,
  postRollDurationMs = DEFAULT_POST_ROLL_MS,
  maxSegmentDurationMs = DEFAULT_MAX_SEGMENT_MS,
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
   *
   * IMPORTANT: cancelRecording() on iOS triggers onRecordingFinished (not
   * onRecordingError). The new segment must only start from inside these
   * callbacks — never from cancelRecording()'s promise — to ensure
   * VisionCamera has fully finalized the previous segment.
   */
  const startBufferSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !mountedRef.current) return;

    segmentStartTimeRef.current = Date.now();
    stateRef.current = 'buffering';

    if (__DEV__) console.log('[RollingRecorder] startBufferSegment → buffering');

    recorder.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        if (!mountedRef.current) return;

        if (__DEV__) console.log(`[RollingRecorder] onRecordingFinished state=${stateRef.current}`);

        // Cancelled segment finalized (iOS fires onRecordingFinished for cancels)
        if (stateRef.current === 'transitioning') {
          if (__DEV__) console.log('[RollingRecorder] cancel finalized → restarting buffer');
          if (!suspendedRef.current) {
            startBufferSegment();
          } else {
            stateRef.current = 'idle';
          }
          return;
        }

        // Keeper segment — save when post-roll stop triggered onRecordingFinished
        if (stateRef.current === 'post-rolling') {
          const duration = Math.round((Date.now() - segmentStartTimeRef.current) / 1000);
          if (__DEV__) console.log(`[RollingRecorder] saving clip duration=${duration}s`);
          try {
            const clip = await saveClip({
              path: video.path,
              duration,
              fps: recordingFpsRef.current,
              sessionId: sessionIdRef.current ?? undefined,
            });
            stateRef.current = 'idle';
            if (__DEV__) console.log(`[RollingRecorder] clip saved id=${clip.id}`);
            onClipSavedRef.current(clip);

            // Re-arm buffering if still enabled and not suspended
            if (enabled && !suspendedRef.current && mountedRef.current) {
              startBufferSegment();
            }
          } catch (err) {
            stateRef.current = 'idle';
            const msg = err instanceof Error ? err.message : 'Failed to save clip';
            if (__DEV__) console.log(`[RollingRecorder] save error: ${msg}`);
            onErrorRef.current?.(msg);
          }
          return;
        }

        if (__DEV__) console.log(`[RollingRecorder] onRecordingFinished ignored (state=${stateRef.current})`);
      },
      onRecordingError: (error: unknown) => {
        if (!mountedRef.current) return;

        // cancelRecording() triggers onRecordingError on Android
        const errorObj = error as { code?: string; message?: string };
        if (errorObj?.code === 'capture/recording-canceled') {
          if (__DEV__) console.log(`[RollingRecorder] cancel confirmed state=${stateRef.current}`);
          if (stateRef.current === 'transitioning') {
            if (!suspendedRef.current) {
              startBufferSegment();
            } else {
              stateRef.current = 'idle';
            }
          }
          return;
        }

        // Real error
        const msg = errorObj?.message ?? 'Recording failed';
        if (__DEV__) console.log(`[RollingRecorder] recording error: ${msg} code=${errorObj?.code}`);
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

      if (__DEV__) console.log('[RollingRecorder] cycle timer → transitioning');
      stateRef.current = 'transitioning';
      // Don't restart from the promise — wait for onRecordingFinished/onRecordingError
      recorder.cancelRecording().catch(() => {
        // If cancelRecording itself throws, fall back to restarting
        if (mountedRef.current && !suspendedRef.current && stateRef.current === 'transitioning') {
          if (__DEV__) console.log('[RollingRecorder] cancelRecording threw → restarting');
          startBufferSegment();
        }
      });
    }, maxSegmentDurationMs);
  }, [recorderRef, enabled, maxSegmentDurationMs, clearCycleTimer, clearPostRollTimer]);

  /** Stop all recording and clean up timers. */
  const stopAll = useCallback(() => {
    const currentState = stateRef.current;
    if (__DEV__) console.log(`[RollingRecorder] stopAll from state=${currentState}`);
    clearCycleTimer();
    clearPostRollTimer();

    stateRef.current = 'idle';

    if (currentState === 'buffering' || currentState === 'post-rolling') {
      recorderRef.current?.cancelRecording().catch(() => {});
    }
  }, [recorderRef, clearCycleTimer, clearPostRollTimer]);

  // Enable/disable rolling recording based on `enabled` prop
  useEffect(() => {
    if (__DEV__) console.log(`[RollingRecorder] enabled effect: enabled=${enabled} suspended=${suspendedRef.current} state=${stateRef.current}`);
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
      const currentState = stateRef.current;
      if (currentState === 'buffering' || currentState === 'post-rolling') {
        recorderRef.current?.cancelRecording().catch(() => {});
      }
      stateRef.current = 'idle';
    };
  }, []);

  /** Notify that a swing was detected. Returns true if capture started, false if ignored. */
  const notifySwingDetected = useCallback((): boolean => {
    const bufferAge = Date.now() - segmentStartTimeRef.current;
    if (__DEV__) console.log(`[RollingRecorder] notifySwingDetected state=${stateRef.current} bufferAge=${bufferAge}ms`);

    if (stateRef.current !== 'buffering') return false;

    // Require minimum buffer age for meaningful pre-roll
    if (bufferAge < MIN_PRE_ROLL_MS) {
      if (__DEV__) console.log(`[RollingRecorder] ignoring — buffer too young (${bufferAge}ms < ${MIN_PRE_ROLL_MS}ms)`);
      return false;
    }

    // Stop cycling — keep current segment recording for post-roll
    clearCycleTimer();
    stateRef.current = 'post-rolling';

    if (__DEV__) console.log(`[RollingRecorder] → post-rolling, stopping in ${postRollMsRef.current}ms`);

    clearPostRollTimer();
    postRollTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (stateRef.current !== 'post-rolling') {
        if (__DEV__) console.log(`[RollingRecorder] post-roll timer fired but state=${stateRef.current}, skipping`);
        return;
      }

      if (__DEV__) console.log('[RollingRecorder] post-roll expired → stopping recording');
      recorderRef.current?.stopRecording().catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to stop recording';
        if (__DEV__) console.log(`[RollingRecorder] stopRecording error: ${msg}`);
        stateRef.current = 'idle';
        onErrorRef.current?.(msg);
      });
    }, postRollMsRef.current);

    return true;
  }, [recorderRef, clearCycleTimer, clearPostRollTimer]);

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
    notifySwingDetected,
    suspend,
    resume,
  };
};
