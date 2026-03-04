import { useRef, useEffect, useCallback } from 'react';
import type { RefObject } from 'react';
import type { VideoFile } from 'react-native-vision-camera';
import type { VisionCameraRecorderRef } from '@/src/components/recording/vision-camera-recorder';
import type { Clip, CameraAngle } from '@/src/types/recording';
import type { SwingTempo } from '@/src/utils/swing-tempo';
import { saveClip } from '@/src/services/recording/clip-storage';

/**
 * Internal states for the swing recorder:
 * - `idle`: not recording — waiting for address detection
 * - `recording`: address detected, recording started, waiting for swing or timeout
 * - `post-rolling`: swing detected, running post-roll timer before stopping
 * - `stopping`: post-roll finished, stopRecording called, waiting for callback
 * - `cancelling`: no swing detected or timeout, cancelRecording called, waiting for callback
 */
export type SwingRecorderState =
  | 'idle'
  | 'recording'
  | 'post-rolling'
  | 'stopping'
  | 'cancelling';

/** Default post-roll duration after swing ends (ms). */
const DEFAULT_POST_ROLL_MS = 3000;

/** Default max recording duration before safety-valve cancel (ms). */
const DEFAULT_MAX_RECORDING_MS = 20000;

export type UseSwingRecorderOptions = {
  /** Ref to the VisionCamera recorder component. */
  recorderRef: RefObject<VisionCameraRecorderRef | null>;
  /** Whether swing recording should be active (classifier enabled + camera previewing). */
  enabled: boolean;
  /** Current detection state from the swing classifier. */
  detectionState: 'idle' | 'address' | 'swinging';
  /** Duration to continue recording after swing ends. Defaults to 3000ms. */
  postRollDurationMs?: number;
  /** Max recording duration before safety cancel. Defaults to 20000ms. */
  maxRecordingDurationMs?: number;
  /** Recording fps for clip metadata. */
  recordingFps?: number;
  /** Session ID for saved clips. */
  sessionId?: string | null;
  /** Camera angle used when recording. */
  cameraAngle?: CameraAngle;
  /** Swing tempo data calculated from shoulder rotation. */
  swingTempo?: SwingTempo | null;
  /** Called when a clip is saved after post-roll completes. */
  onClipSaved: (clip: Clip) => void;
  /** Called on recording errors. */
  onError?: (error: string) => void;
};

export type UseSwingRecorderReturn = {
  /** Whether the recorder is actively recording (any non-idle state). */
  isRecording: boolean;
  /** Current recorder state machine state. */
  recorderState: SwingRecorderState;
  /** Suspend swing recording (e.g. for manual record). */
  suspend: () => void;
  /** Resume swing recording after suspension. */
  resume: () => void;
};

/**
 * Address-triggered swing recorder.
 *
 * Watches `detectionState` from the swing classifier and starts recording
 * when address is detected. When a swing is detected, keeps recording for
 * a post-roll period then saves. If no swing occurs, cancels and discards.
 *
 * Simpler than rolling recorder — no cycling, no wasted segments. Only
 * records when there's a real chance of a swing.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useSwingRecorder } from '@/src/hooks/use-swing-recorder'`
 */
export const useSwingRecorder = ({
  recorderRef,
  enabled,
  detectionState,
  postRollDurationMs = DEFAULT_POST_ROLL_MS,
  maxRecordingDurationMs = DEFAULT_MAX_RECORDING_MS,
  recordingFps = 30,
  sessionId = null,
  cameraAngle,
  swingTempo = null,
  onClipSaved,
  onError,
}: UseSwingRecorderOptions): UseSwingRecorderReturn => {
  // All mutable state in refs to avoid stale closures in recording callbacks
  const stateRef = useRef<SwingRecorderState>('idle');
  const postRollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendedRef = useRef(false);
  const mountedRef = useRef(true);
  const recordingStartTimeRef = useRef<number>(0);

  // Track latest detectionState for use inside async callbacks
  const detectionStateRef = useRef(detectionState);
  detectionStateRef.current = detectionState;

  // Post-roll expired but still swinging — flag checked by detectionState effect
  const postRollExpiredRef = useRef(false);

  // Keep latest callback refs to avoid stale closures
  const onClipSavedRef = useRef(onClipSaved);
  onClipSavedRef.current = onClipSaved;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const recordingFpsRef = useRef(recordingFps);
  recordingFpsRef.current = recordingFps;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const cameraAngleRef = useRef(cameraAngle);
  cameraAngleRef.current = cameraAngle;
  const swingTempoRef = useRef(swingTempo);
  swingTempoRef.current = swingTempo;
  const postRollMsRef = useRef(postRollDurationMs);
  postRollMsRef.current = postRollDurationMs;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const clearPostRollTimer = useCallback(() => {
    if (postRollTimerRef.current !== null) {
      clearTimeout(postRollTimerRef.current);
      postRollTimerRef.current = null;
    }
  }, []);

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  /** Stop recording and save the clip. */
  const stopAndSave = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !mountedRef.current) return;
    if (stateRef.current !== 'post-rolling') return;

    if (__DEV__) console.log('[SwingRecorder] stopAndSave → stopping');
    stateRef.current = 'stopping';
    clearPostRollTimer();
    clearMaxDurationTimer();

    recorder.stopRecording().catch((err) => {
      const msg = err instanceof Error ? err.message : 'Failed to stop recording';
      if (__DEV__) console.log(`[SwingRecorder] stopRecording error: ${msg}`);
      stateRef.current = 'idle';
      onErrorRef.current?.(msg);
    });
  }, [recorderRef, clearPostRollTimer, clearMaxDurationTimer]);

  /** Cancel the current recording and discard. */
  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !mountedRef.current) return;

    const currentState = stateRef.current;
    if (currentState !== 'recording' && currentState !== 'post-rolling') return;

    if (__DEV__) console.log(`[SwingRecorder] cancelRecording from state=${currentState} → cancelling`);
    stateRef.current = 'cancelling';
    clearPostRollTimer();
    clearMaxDurationTimer();
    postRollExpiredRef.current = false;

    recorder.cancelRecording().catch(() => {
      // If cancelRecording itself throws, just go idle
      if (mountedRef.current && stateRef.current === 'cancelling') {
        if (__DEV__) console.log('[SwingRecorder] cancelRecording threw → idle');
        stateRef.current = 'idle';
      }
    });
  }, [recorderRef, clearPostRollTimer, clearMaxDurationTimer]);

  /**
   * Start recording. Handles the VisionCamera callbacks internally.
   *
   * IMPORTANT: cancelRecording() on iOS triggers onRecordingFinished (not
   * onRecordingError). Must handle both callback paths for cancel.
   */
  const startRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !mountedRef.current) return;
    if (stateRef.current !== 'idle') {
      if (__DEV__) console.log(`[SwingRecorder] startRecording skipped — state=${stateRef.current}`);
      return;
    }

    recordingStartTimeRef.current = Date.now();
    stateRef.current = 'recording';
    postRollExpiredRef.current = false;

    if (__DEV__) console.log('[SwingRecorder] startRecording → recording');

    recorder.startRecording({
      onRecordingFinished: async (video: VideoFile) => {
        if (!mountedRef.current) return;

        const finishedState = stateRef.current;
        if (__DEV__) console.log(`[SwingRecorder] onRecordingFinished state=${finishedState}`);

        // Cancel finalized (iOS fires onRecordingFinished for cancels)
        if (finishedState === 'cancelling') {
          if (__DEV__) console.log('[SwingRecorder] cancel finalized (iOS path)');
          stateRef.current = 'idle';
          // Auto-restart if address detected during cancel
          if (!suspendedRef.current && enabledRef.current && detectionStateRef.current === 'address') {
            if (__DEV__) console.log('[SwingRecorder] address during cancel → restarting');
            startRecording();
          }
          return;
        }

        // Keeper segment — save
        if (finishedState === 'stopping') {
          const duration = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
          if (__DEV__) console.log(`[SwingRecorder] saving clip duration=${duration}s`);
          try {
            const tempo = swingTempoRef.current;
            const clip = await saveClip({
              path: video.path,
              duration,
              fps: recordingFpsRef.current,
              sessionId: sessionIdRef.current ?? undefined,
              cameraAngle: cameraAngleRef.current,
              tempoRatio: tempo?.tempoRatio,
              backswingDurationMs: tempo?.backswingDurationMs,
              downswingDurationMs: tempo?.downswingDurationMs,
            });
            stateRef.current = 'idle';
            if (__DEV__) console.log(`[SwingRecorder] clip saved id=${clip.id}`);
            onClipSavedRef.current(clip);

            // Re-arm if address is already detected again
            if (!suspendedRef.current && enabledRef.current && detectionStateRef.current === 'address') {
              if (__DEV__) console.log('[SwingRecorder] address after save → restarting');
              startRecording();
            }
          } catch (err) {
            stateRef.current = 'idle';
            const msg = err instanceof Error ? err.message : 'Failed to save clip';
            if (__DEV__) console.log(`[SwingRecorder] save error: ${msg}`);
            onErrorRef.current?.(msg);
          }
          return;
        }

        if (__DEV__) console.log(`[SwingRecorder] onRecordingFinished ignored (state=${finishedState})`);
      },
      onRecordingError: (error: unknown) => {
        if (!mountedRef.current) return;

        // cancelRecording() triggers onRecordingError on Android
        const errorObj = error as { code?: string; message?: string };
        if (errorObj?.code === 'capture/recording-canceled') {
          if (__DEV__) console.log(`[SwingRecorder] cancel confirmed (Android) state=${stateRef.current}`);
          if (stateRef.current === 'cancelling') {
            stateRef.current = 'idle';
            // Auto-restart if address detected during cancel
            if (!suspendedRef.current && enabledRef.current && detectionStateRef.current === 'address') {
              if (__DEV__) console.log('[SwingRecorder] address during cancel → restarting');
              startRecording();
            }
          }
          return;
        }

        // Real error
        const msg = errorObj?.message ?? 'Recording failed';
        if (__DEV__) console.log(`[SwingRecorder] recording error: ${msg} code=${errorObj?.code}`);
        stateRef.current = 'idle';
        clearPostRollTimer();
        clearMaxDurationTimer();
        postRollExpiredRef.current = false;
        onErrorRef.current?.(msg);
      },
    });

    // Safety valve — cancel if recording exceeds max duration
    clearMaxDurationTimer();
    maxDurationTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (stateRef.current === 'recording') {
        if (__DEV__) console.log(`[SwingRecorder] max duration (${maxRecordingDurationMs}ms) → cancelling`);
        cancelRecording();
      }
    }, maxRecordingDurationMs);
  }, [recorderRef, maxRecordingDurationMs, cancelRecording, clearPostRollTimer, clearMaxDurationTimer]);

  /** Stop all recording and clean up timers. */
  const stopAll = useCallback(() => {
    const currentState = stateRef.current;
    if (__DEV__) console.log(`[SwingRecorder] stopAll from state=${currentState}`);
    clearPostRollTimer();
    clearMaxDurationTimer();
    postRollExpiredRef.current = false;

    if (currentState === 'recording' || currentState === 'post-rolling') {
      stateRef.current = 'cancelling';
      recorderRef.current?.cancelRecording().catch(() => {
        if (mountedRef.current) stateRef.current = 'idle';
      });
    } else {
      stateRef.current = 'idle';
    }
  }, [recorderRef, clearPostRollTimer, clearMaxDurationTimer]);

  // Watch detectionState for state machine transitions
  useEffect(() => {
    if (!enabled || suspendedRef.current) return;

    const currentRecorderState = stateRef.current;

    if (__DEV__) {
      console.log(`[SwingRecorder] detectionState=${detectionState} recorderState=${currentRecorderState}`);
    }

    switch (currentRecorderState) {
      case 'idle':
        // Start recording when address is detected
        if (detectionState === 'address') {
          startRecording();
        }
        break;

      case 'recording':
        // Swing started — transition to post-rolling with timer
        if (detectionState === 'swinging') {
          if (__DEV__) console.log(`[SwingRecorder] swing detected → post-rolling (${postRollMsRef.current}ms timer)`);
          stateRef.current = 'post-rolling';
          clearMaxDurationTimer();

          clearPostRollTimer();
          postRollTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;

            // If still swinging when timer fires, defer stop
            if (detectionStateRef.current === 'swinging') {
              if (__DEV__) console.log('[SwingRecorder] post-roll expired but still swinging — deferring stop');
              postRollExpiredRef.current = true;
              return;
            }

            // Timer expired and not swinging — stop and save
            if (stateRef.current === 'post-rolling') {
              stopAndSave();
            }
          }, postRollMsRef.current);
        }
        // No swing, back to idle — cancel and discard
        else if (detectionState === 'idle') {
          if (__DEV__) console.log('[SwingRecorder] address→idle with no swing → cancelling');
          cancelRecording();
        }
        break;

      case 'post-rolling':
        // Post-roll timer already expired and swing just ended — stop now
        if (detectionState !== 'swinging' && postRollExpiredRef.current) {
          if (__DEV__) console.log('[SwingRecorder] swing ended after deferred post-roll → stopping');
          postRollExpiredRef.current = false;
          stopAndSave();
        }
        break;

      // stopping/cancelling: no-op, waiting for VisionCamera callbacks
    }
  }, [enabled, detectionState, startRecording, cancelRecording, stopAndSave, clearPostRollTimer, clearMaxDurationTimer]);

  // Enable/disable effect
  useEffect(() => {
    if (__DEV__) console.log(`[SwingRecorder] enabled=${enabled} suspended=${suspendedRef.current} state=${stateRef.current}`);
    if (!enabled || suspendedRef.current) {
      if (stateRef.current !== 'idle') {
        stopAll();
      }
    }
  }, [enabled, stopAll]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPostRollTimer();
      clearMaxDurationTimer();
      const currentState = stateRef.current;
      if (currentState !== 'idle') {
        recorderRef.current?.cancelRecording().catch(() => {});
      }
      stateRef.current = 'idle';
    };
  }, []);

  const suspend = useCallback(() => {
    suspendedRef.current = true;
    if (stateRef.current !== 'idle') {
      stopAll();
    }
  }, [stopAll]);

  const resume = useCallback(() => {
    suspendedRef.current = false;
    // If address is already detected and enabled, start recording
    if (enabledRef.current && stateRef.current === 'idle' && detectionStateRef.current === 'address') {
      startRecording();
    }
  }, [startRecording]);

  return {
    isRecording: stateRef.current !== 'idle',
    recorderState: stateRef.current,
    suspend,
    resume,
  };
};
