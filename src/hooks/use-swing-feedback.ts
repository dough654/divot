import { useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';

import { useHaptics } from './use-haptics';

/* eslint-disable @typescript-eslint/no-var-requires */
const SWING_START_SOUND: AVPlaybackSource = require('@/assets/sounds/swing-start.wav');
const SWING_END_SOUND: AVPlaybackSource = require('@/assets/sounds/swing-end.wav');
/* eslint-enable @typescript-eslint/no-var-requires */

type UseSwingFeedbackOptions = {
  /** Whether audio/haptic feedback is enabled. */
  enabled: boolean;
};

type UseSwingFeedbackReturn = {
  /** Play the "swing started" audio cue + heavy haptic. */
  playSwingStart: () => void;
  /** Play the "swing ended" audio cue + medium haptic. */
  playSwingEnd: () => void;
};

/**
 * Hook that provides audio and haptic feedback for swing detection events.
 *
 * Preloads short WAV sounds on mount (when enabled) and exposes fire-and-forget
 * play functions. Unloads sounds on unmount. Fails silently on errors.
 *
 * Audio recording is disabled on VisionCamera so there is no AVAudioSession
 * conflict between expo-av playback and camera recording.
 *
 * Excluded from hooks barrel — import directly:
 * `import { useSwingFeedback } from '@/src/hooks/use-swing-feedback'`
 */
export const useSwingFeedback = ({ enabled }: UseSwingFeedbackOptions): UseSwingFeedbackReturn => {
  const startSoundRef = useRef<Audio.Sound | null>(null);
  const endSoundRef = useRef<Audio.Sound | null>(null);
  const haptics = useHaptics();

  // Preload sounds when enabled, unload on disable/unmount
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });

        const [startResult, endResult] = await Promise.all([
          Audio.Sound.createAsync(SWING_START_SOUND),
          Audio.Sound.createAsync(SWING_END_SOUND),
        ]);

        if (cancelled) {
          startResult.sound.unloadAsync().catch(() => {});
          endResult.sound.unloadAsync().catch(() => {});
          return;
        }

        startSoundRef.current = startResult.sound;
        endSoundRef.current = endResult.sound;
      } catch {
        // Audio loading failed — haptics will still work
      }
    };

    load();

    return () => {
      cancelled = true;
      startSoundRef.current?.unloadAsync().catch(() => {});
      endSoundRef.current?.unloadAsync().catch(() => {});
      startSoundRef.current = null;
      endSoundRef.current = null;
    };
  }, [enabled]);

  const playSwingStart = useCallback(() => {
    if (!enabled) return;
    haptics.heavy();
    const sound = startSoundRef.current;
    if (!sound) return;
    sound.setPositionAsync(0).then(() => sound.playAsync()).catch(() => {});
  }, [enabled, haptics]);

  const playSwingEnd = useCallback(() => {
    if (!enabled) return;
    haptics.medium();
    const sound = endSoundRef.current;
    if (!sound) return;
    sound.setPositionAsync(0).then(() => sound.playAsync()).catch(() => {});
  }, [enabled, haptics]);

  return { playSwingStart, playSwingEnd };
};
