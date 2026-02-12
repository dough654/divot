import { useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';

import { useHaptics } from './use-haptics';

/* eslint-disable @typescript-eslint/no-var-requires */
const SWING_END_SOUND: AVPlaybackSource = require('@/assets/sounds/swing-end.wav');
/* eslint-enable @typescript-eslint/no-var-requires */

type UseSwingFeedbackOptions = {
  /** Whether audio/haptic feedback is enabled. */
  enabled: boolean;
};

type UseSwingFeedbackReturn = {
  /** Heavy haptic for swing start. Audio is intentionally omitted here
   *  because expo-av reconfigures the AVAudioSession which conflicts
   *  with VisionCamera's audio recording. */
  playSwingStart: () => void;
  /** Play the "swing ended" audio cue + medium haptic.
   *  Safe to call after recording has fully stopped (VisionCamera
   *  has released the audio session). */
  playSwingEnd: () => void;
};

/**
 * Hook that provides audio and haptic feedback for swing detection events.
 *
 * Swing start uses haptic-only to avoid audio session conflicts with
 * VisionCamera's recording. Swing end plays an audio cue (safe because
 * recording has finished by the time it's called).
 *
 * Preloads the end sound via expo-av on mount. Unloads on unmount.
 * Fails silently on errors.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useSwingFeedback } from '@/src/hooks/use-swing-feedback'`
 */
export const useSwingFeedback = ({ enabled }: UseSwingFeedbackOptions): UseSwingFeedbackReturn => {
  const endSoundRef = useRef<Audio.Sound | null>(null);
  const haptics = useHaptics();

  // Preload end sound when enabled, unload on disable/unmount.
  // Don't call setAudioModeAsync here — VisionCamera owns the audio
  // session while the camera screen is active.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      try {
        const result = await Audio.Sound.createAsync(SWING_END_SOUND);

        if (cancelled) {
          result.sound.unloadAsync().catch(() => {});
          return;
        }

        endSoundRef.current = result.sound;
      } catch {
        // Audio loading failed — haptics will still work
      }
    };

    load();

    return () => {
      cancelled = true;
      endSoundRef.current?.unloadAsync().catch(() => {});
      endSoundRef.current = null;
    };
  }, [enabled]);

  const playSwingStart = useCallback(() => {
    if (!enabled) return;
    // Haptic only — playing audio here would reconfigure the iOS
    // AVAudioSession and break VisionCamera's recording.
    haptics.heavy();
  }, [enabled, haptics]);

  const playSwingEnd = useCallback(() => {
    if (!enabled) return;
    haptics.medium();
    const sound = endSoundRef.current;
    if (!sound) return;
    // Configure audio mode just before playing — VisionCamera should
    // have released the audio session by now.
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).then(() => {
      sound.setPositionAsync(0).then(() => sound.playAsync()).catch(() => {});
    }).catch(() => {});
  }, [enabled, haptics]);

  return { playSwingStart, playSwingEnd };
};
