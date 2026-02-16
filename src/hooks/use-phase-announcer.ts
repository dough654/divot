import { useEffect, useRef, useCallback } from 'react';
import * as Speech from 'expo-speech';

/** Minimum time (ms) between consecutive announcements to avoid rapid-fire TTS. */
const DEBOUNCE_MS = 500;

/**
 * Delay (ms) after stopping the recording before speaking.
 * iOS needs time to switch audio routes from earpiece (playAndRecord)
 * back to main speaker (playback) after the recording stops.
 */
const ROUTE_SWITCH_DELAY_MS = 150;

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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type UsePhaseAnnouncerOptions = {
  /** Whether TTS announcements are active. */
  enabled: boolean;
  /** Current detection state from classifier or motion pipeline. */
  detectionState: string;
  /**
   * Pause audio metering before speaking so iOS exits playAndRecord mode
   * and TTS plays at full volume through the main speaker.
   */
  pauseMetering?: () => Promise<void>;
  /** Resume audio metering after speech finishes. */
  resumeMetering?: () => Promise<void>;
};

/**
 * Speaks swing detection phase transitions via TTS for hands-free testing.
 *
 * On iOS, audio metering forces the session into playAndRecord mode which
 * routes audio to the earpiece. This hook stops the metering recorder,
 * waits for iOS to switch audio routes back to the main speaker, speaks,
 * then restores metering.
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

  // Guard against the race where Speech.stop() triggers onStopped from
  // a previous utterance, which would call resume before the new speech starts.
  const isSpeakingRef = useRef(false);

  const doResume = useCallback(() => {
    if (isSpeakingRef.current) return; // Another speak() cycle owns the session
    resumeMeteringRef.current?.();
  }, []);

  const speak = useCallback((label: string) => {
    const pause = pauseMeteringRef.current;

    // Mark that we're in a speak cycle — blocks stale onStopped resume calls
    isSpeakingRef.current = true;

    // Stop any in-progress speech first (won't trigger stale resume because of guard)
    Speech.stop();

    if (!pause) {
      isSpeakingRef.current = false;
      Speech.speak(label, { rate: 1.2 });
      return;
    }

    pause()
      .then(() => delay(ROUTE_SWITCH_DELAY_MS))
      .then(() => {
        // Now safe to speak — iOS should have switched to main speaker
        isSpeakingRef.current = false;
        Speech.speak(label, {
          rate: 1.2,
          onDone: doResume,
          onStopped: doResume,
          onError: doResume,
        });
      })
      .catch(() => {
        isSpeakingRef.current = false;
        Speech.speak(label, { rate: 1.2 });
      });
  }, [doResume]);

  useEffect(() => {
    if (!enabled) {
      previousStateRef.current = null;
      isSpeakingRef.current = false;
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
    speak(label);
  }, [enabled, detectionState, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isSpeakingRef.current = false;
      Speech.stop();
    };
  }, []);
};
