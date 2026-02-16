import { useEffect, useRef, useCallback } from 'react';
import * as Speech from 'expo-speech';

/** Minimum time (ms) between consecutive announcements to avoid rapid-fire TTS. */
const DEBOUNCE_MS = 500;

/** Map detection states to human-friendly spoken labels. */
const PHASE_LABELS: Record<string, string> = {
  // Classifier phases (SwingPhase)
  idle: 'Reset',
  address: 'Address',
  backswing: 'Backswing',
  downswing: 'Downswing',
  impact: 'Impact',
  follow_through: 'Follow through',
  finish: 'Finish',
  // Motion detection states (MotionSwingState)
  watching: 'Watching',
  still: 'Still',
  armed: 'Armed',
  detecting: 'Detecting',
  swing: 'Swing',
  cooldown: 'Cooldown',
};

type UsePhaseAnnouncerOptions = {
  /** Whether TTS announcements are active. */
  enabled: boolean;
  /** Current detection state from classifier or motion pipeline. */
  detectionState: string;
  /**
   * Pause audio metering before speaking so iOS exits playAndRecord mode
   * and TTS plays at full volume. Called before each announcement.
   */
  pauseMetering?: () => Promise<void>;
  /**
   * Resume audio metering after speech finishes.
   */
  resumeMetering?: () => Promise<void>;
};

/**
 * Speaks swing detection phase transitions via TTS for hands-free testing.
 *
 * Gated by `enabled` — intended to be tied to `debugOverlayEnabled` so it
 * only fires during development/testing sessions.
 *
 * On iOS, audio metering forces the session into playAndRecord mode which
 * heavily attenuates playback. This hook pauses metering around each
 * announcement so TTS plays through the main speaker at full volume.
 */
export const usePhaseAnnouncer = ({
  enabled,
  detectionState,
  pauseMetering,
  resumeMetering,
}: UsePhaseAnnouncerOptions): void => {
  const previousStateRef = useRef<string | null>(null);
  const lastAnnouncedAtRef = useRef(0);
  const pauseMeteringRef = useRef(pauseMetering);
  const resumeMeteringRef = useRef(resumeMetering);
  pauseMeteringRef.current = pauseMetering;
  resumeMeteringRef.current = resumeMetering;

  const speak = useCallback((label: string) => {
    const pause = pauseMeteringRef.current;
    const resume = resumeMeteringRef.current;

    if (!pause || !resume) {
      // No metering control — just speak (will be quiet on iOS)
      Speech.speak(label, { rate: 1.2 });
      return;
    }

    pause().then(() => {
      Speech.speak(label, {
        rate: 1.2,
        onDone: () => { resume(); },
        onStopped: () => { resume(); },
        onError: () => { resume(); },
      });
    }).catch(() => {
      Speech.speak(label, { rate: 1.2 });
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      previousStateRef.current = null;
      Speech.stop();
      return;
    }

    // Skip if state hasn't changed
    if (detectionState === previousStateRef.current) return;

    previousStateRef.current = detectionState;

    // Debounce rapid transitions
    const now = Date.now();
    if (now - lastAnnouncedAtRef.current < DEBOUNCE_MS) return;

    lastAnnouncedAtRef.current = now;

    const label = PHASE_LABELS[detectionState] ?? detectionState;
    Speech.stop();
    speak(label);
  }, [enabled, detectionState, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);
};
