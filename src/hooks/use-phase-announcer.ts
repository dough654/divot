import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
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

/**
 * Temporarily disables the recording audio session so TTS plays at full
 * volume through the main speaker, then restores it after speech finishes.
 *
 * `allowsRecordingIOS: true` (set by audio metering) switches iOS to
 * `playAndRecord` mode which heavily attenuates all playback output.
 */
const speakLoud = (label: string): void => {
  Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  }).then(() => {
    Speech.speak(label, {
      rate: 1.2,
      onDone: restoreRecordingMode,
      onStopped: restoreRecordingMode,
      onError: restoreRecordingMode,
    });
  }).catch(() => {
    // Fall back to quiet speech if mode switch fails
    Speech.speak(label, { rate: 1.2 });
  });
};

const restoreRecordingMode = (): void => {
  Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  }).catch(() => {
    // Best-effort restore — audio metering will re-set on next poll cycle anyway
  });
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

    const label = PHASE_LABELS[detectionState] ?? detectionState;
    Speech.stop();
    speakLoud(label);
  }, [enabled, detectionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
      restoreRecordingMode();
    };
  }, []);
};
