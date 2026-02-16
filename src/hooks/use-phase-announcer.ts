import { useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';

/** Minimum time (ms) between consecutive announcements to avoid rapid-fire TTS. */
const DEBOUNCE_MS = 500;

/** Map detection states to human-friendly spoken labels. */
const PHASE_LABELS: Record<string, string> = {
  // Classifier phases (SwingPhase)
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
};

/**
 * Speaks swing detection phase transitions via TTS for hands-free testing.
 *
 * Gated by `enabled` — intended to be tied to `debugOverlayEnabled` so it
 * only fires during development/testing sessions.
 *
 * Audio routing note: this hook is only enabled on the classifier path,
 * which doesn't use audio metering. Without the metering recorder, iOS
 * stays in normal playback mode and routes TTS to the main speaker.
 */
export const usePhaseAnnouncer = ({ enabled, detectionState }: UsePhaseAnnouncerOptions): void => {
  const previousStateRef = useRef<string | null>(null);
  const lastAnnouncedAtRef = useRef(0);

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

    const label = PHASE_LABELS[detectionState];
    if (!label) return;

    Speech.stop();
    Speech.speak(label, { rate: 1.2 });
  }, [enabled, detectionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);
};
