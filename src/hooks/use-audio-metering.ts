import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';

export type UseAudioMeteringOptions = {
  /** Whether audio metering is active. */
  enabled: boolean;
  /** Polling rate in fps. Defaults to 20. */
  pollingFps?: number;
  /** Peak threshold in linear scale (0-1). Defaults to 0.5. */
  peakThreshold?: number;
};

export type UseAudioMeteringReturn = {
  /** Current audio level in linear scale, 0-1. Null when disabled. */
  audioLevel: number | null;
  /** Whether the current audio level exceeds the peak threshold. */
  isPeak: boolean;
  /** Temporarily stop metering so another audio source can use full volume. */
  pause: () => Promise<void>;
  /** Resume metering after a pause. */
  resume: () => Promise<void>;
};

/**
 * Convert dBFS metering value to linear scale (0-1).
 * expo-av reports metering in dBFS where 0 dB = max and -160 dB = silence.
 */
const dbfsToLinear = (dbfs: number): number => {
  // Clamp to reasonable range
  const clamped = Math.max(-80, Math.min(0, dbfs));
  // Convert: 10^(dB/20) gives linear amplitude
  return Math.pow(10, clamped / 20);
};

/**
 * Hook that uses expo-av Recording with metering enabled to detect audio levels.
 *
 * Creates a minimal audio recording session with metering to read dBFS levels.
 * The recording is not saved — we only care about the metering data.
 *
 * Sets `allowsRecordingIOS: true` so VisionCamera and audio metering can
 * coexist (VisionCamera uses `audio={false}` so there's no AVAudioSession conflict).
 *
 * Import directly: `import { useAudioMetering } from '@/src/hooks/use-audio-metering'`
 */
export const useAudioMetering = ({
  enabled,
  pollingFps = 20,
  peakThreshold = 0.5,
}: UseAudioMeteringOptions): UseAudioMeteringReturn => {
  const [audioLevel, setAudioLevel] = useState<number | null>(null);
  const [isPeak, setIsPeak] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMetering = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      recordingRef.current = recording;

      // Start polling metering data
      intervalRef.current = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            const linear = dbfsToLinear(status.metering);
            setAudioLevel(linear);
            setIsPeak(linear >= peakThreshold);
          }
        } catch {
          // Ignore polling errors
        }
      }, Math.round(1000 / pollingFps));
    } catch (err) {
      if (__DEV__) {
        console.warn('[useAudioMetering] Failed to start metering:', err);
      }
    }
  }, [pollingFps, peakThreshold]);

  const stopMetering = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const recording = recordingRef.current;
    if (recording) {
      recordingRef.current = null;
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // Ignore cleanup errors
      }
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch {
      // Ignore cleanup errors
    }

    setAudioLevel(null);
    setIsPeak(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      startMetering();
    } else {
      stopMetering();
    }

    return () => {
      stopMetering();
    };
  }, [enabled, startMetering, stopMetering]);

  return { audioLevel, isPeak, pause: stopMetering, resume: startMetering };
};
