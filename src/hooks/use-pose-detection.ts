import { useState, useCallback } from 'react';
import { VisionCameraProxy, Frame, runAtTargetFps } from 'react-native-vision-camera';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { parsePoseArray } from '@/src/utils/pose-normalization';
import type { PoseFrame } from '@/src/types/pose';

// Ensure the native module is loaded so the plugin is registered
import '../../modules/vision-camera-pose-detection/src';

export type UsePoseDetectionOptions = {
  /** Whether pose detection is enabled (gated by feature flag + user setting). */
  enabled: boolean;
  /** Target detection frames per second. Defaults to 10. */
  targetDetectionFps?: number;
};

export type UsePoseDetectionReturn = {
  /** Raw 42-element shared value for the overlay (worklet-accessible). */
  poseSharedValue: SharedValue<number[]>;
  /** Parsed pose frame for JS consumers. Updated at detection fps. */
  latestPose: PoseFrame | null;
  /** Whether the detector is actively running. */
  isDetecting: boolean;
  /** Frame processor callback to inject into VisionCameraRecorder's onFrame. */
  processFrame: ((frame: Frame) => void) | null;
};

// Initialize the plugin once at module scope — cheap if never called.
// Must be outside the hook so it's available in the worklet closure.
const posePlugin = VisionCameraProxy.initFrameProcessorPlugin('detectPose', {});

/**
 * Hook that manages pose detection via the native "detectPose" frame processor plugin.
 *
 * Returns a shared value for the overlay (worklet-safe) and a parsed PoseFrame
 * for JS consumers (state machine, UI indicators).
 *
 * Excluded from hooks barrel — has native dependency.
 * Import directly: `import { usePoseDetection } from '@/src/hooks/use-pose-detection'`
 */
export const usePoseDetection = ({
  enabled,
  targetDetectionFps = 10,
}: UsePoseDetectionOptions): UsePoseDetectionReturn => {
  const poseSharedValue = useSharedValue<number[]>([]);
  const [latestPose, setLatestPose] = useState<PoseFrame | null>(null);

  // Bridge shared value changes to React state for JS consumers
  const handlePoseUpdate = useCallback((data: number[]) => {
    if (data.length === 42) {
      const parsed = parsePoseArray(data, Date.now());
      setLatestPose(parsed);
    }
  }, []);

  useAnimatedReaction(
    () => poseSharedValue.value,
    (current) => {
      if (current.length === 42) {
        runOnJS(handlePoseUpdate)(current);
      }
    },
    [handlePoseUpdate]
  );

  // Frame processor callback — called from VisionCameraRecorder's onFrame.
  // Uses runAtTargetFps from VisionCamera for worklet-safe throttling.
  // posePlugin is captured from module scope (not a ref).
  const processFrame = useCallback((frame: Frame) => {
    'worklet';
    if (!posePlugin) return;

    runAtTargetFps(targetDetectionFps, () => {
      'worklet';
      const result = posePlugin.call(frame);
      if (result && Array.isArray(result)) {
        poseSharedValue.value = result as number[];
      }
    });
  }, [targetDetectionFps]);

  return {
    poseSharedValue,
    latestPose,
    isDetecting: enabled && !!posePlugin,
    processFrame: enabled ? processFrame : null,
  };
};
