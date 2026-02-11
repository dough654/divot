import { useState, useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

type VideoDimensions = {
  videoWidth: number;
  videoHeight: number;
};

type ContainerDimensions = {
  containerWidth: number;
  containerHeight: number;
};

type UseVideoZoomParams = {
  videoDimensions: VideoDimensions | null;
  containerDimensions: ContainerDimensions | null;
};

// Worklet versions of zoom-math functions (source of truth is src/utils/zoom-math.ts)

const computeCoverScaleWorklet = (
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): number => {
  'worklet';
  if (containerWidth <= 0 || containerHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return 1;
  }
  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;
  return videoAspect > containerAspect
    ? videoAspect / containerAspect
    : containerAspect / videoAspect;
};

const computeMaxTranslationWorklet = (
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
  scale: number,
): { maxTx: number; maxTy: number } => {
  'worklet';
  if (containerWidth <= 0 || containerHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return { maxTx: 0, maxTy: 0 };
  }
  const videoAspect = videoWidth / videoHeight;
  const renderedWidth = Math.min(containerWidth, containerHeight * videoAspect);
  const renderedHeight = Math.min(containerHeight, containerWidth / videoAspect);
  const maxTx = Math.max(0, (renderedWidth * scale - containerWidth) / 2);
  const maxTy = Math.max(0, (renderedHeight * scale - containerHeight) / 2);
  return { maxTx, maxTy };
};

const clampWorklet = (value: number, limit: number): number => {
  'worklet';
  if (limit <= 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
};

const TIMING_CONFIG = { duration: 250 };
const SNAP_THRESHOLD = 1.05;

/**
 * Encapsulates pinch-to-zoom, pan, and double-tap gestures for a video view.
 *
 * Scale range: 1.0 (contain) to maxScale. Pan is clamped so video edges
 * never pull inward past the container.
 */
export const useVideoZoom = ({
  videoDimensions,
  containerDimensions,
}: UseVideoZoomParams) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  // Focal-point offset accumulated during a pinch
  const focalOffsetX = useSharedValue(0);
  const focalOffsetY = useSharedValue(0);

  const [isZoomed, setIsZoomed] = useState(false);

  // Derived values from dimensions (shared values for worklet access)
  const containerW = useSharedValue(0);
  const containerH = useSharedValue(0);
  const videoW = useSharedValue(0);
  const videoH = useSharedValue(0);
  const coverScale = useSharedValue(1);
  const maxScale = useSharedValue(3);

  // Update shared values when dimensions change
  if (containerDimensions) {
    containerW.value = containerDimensions.containerWidth;
    containerH.value = containerDimensions.containerHeight;
  }
  if (videoDimensions) {
    videoW.value = videoDimensions.videoWidth;
    videoH.value = videoDimensions.videoHeight;
  }
  if (containerDimensions && videoDimensions) {
    const cs = computeCoverScaleWorklet(
      containerDimensions.containerWidth,
      containerDimensions.containerHeight,
      videoDimensions.videoWidth,
      videoDimensions.videoHeight,
    );
    coverScale.value = cs;
    maxScale.value = Math.max(cs * 1.5, 3.0);
  }

  const updateIsZoomed = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      focalOffsetX.value = 0;
      focalOffsetY.value = 0;
    })
    .onUpdate((event) => {
      const newScale = Math.min(
        maxScale.value,
        Math.max(1, savedScale.value * event.scale),
      );

      // Focal-point adjustment: shift translate so zoom centers on pinch midpoint
      if (savedScale.value > 0) {
        const scaleDelta = newScale / scale.value;
        const focalX = event.focalX - containerW.value / 2;
        const focalY = event.focalY - containerH.value / 2;
        const newFocalOffsetX = focalOffsetX.value + focalX * (1 - scaleDelta);
        const newFocalOffsetY = focalOffsetY.value + focalY * (1 - scaleDelta);

        const { maxTx, maxTy } = computeMaxTranslationWorklet(
          containerW.value, containerH.value,
          videoW.value, videoH.value,
          newScale,
        );

        translateX.value = clampWorklet(savedTranslateX.value + newFocalOffsetX, maxTx);
        translateY.value = clampWorklet(savedTranslateY.value + newFocalOffsetY, maxTy);
        focalOffsetX.value = newFocalOffsetX;
        focalOffsetY.value = newFocalOffsetY;
      }

      scale.value = newScale;
    })
    .onEnd(() => {
      // Snap to 1.0 if barely zoomed
      if (scale.value < SNAP_THRESHOLD) {
        scale.value = withTiming(1, TIMING_CONFIG);
        translateX.value = withTiming(0, TIMING_CONFIG);
        translateY.value = withTiming(0, TIMING_CONFIG);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(updateIsZoomed)(false);
      } else {
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        runOnJS(updateIsZoomed)(true);
      }
    }), [
    scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY,
    focalOffsetX, focalOffsetY, containerW, containerH, videoW, videoH,
    maxScale, updateIsZoomed,
  ]);

  const panGesture = useMemo(() => Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      const { maxTx, maxTy } = computeMaxTranslationWorklet(
        containerW.value, containerH.value,
        videoW.value, videoH.value,
        scale.value,
      );
      translateX.value = clampWorklet(savedTranslateX.value + event.translationX, maxTx);
      translateY.value = clampWorklet(savedTranslateY.value + event.translationY, maxTy);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    }), [
    scale, translateX, translateY, savedTranslateX, savedTranslateY,
    containerW, containerH, videoW, videoH,
  ]);

  const doubleTapGesture = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1, TIMING_CONFIG);
      translateX.value = withTiming(0, TIMING_CONFIG);
      translateY.value = withTiming(0, TIMING_CONFIG);
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      runOnJS(updateIsZoomed)(false);
    }), [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY, updateIsZoomed]);

  const gesture = useMemo(
    () => Gesture.Exclusive(
      doubleTapGesture,
      Gesture.Simultaneous(pinchGesture, panGesture),
    ),
    [doubleTapGesture, pinchGesture, panGesture],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  /** Toggle between contain (1.0) and cover scale with animation. */
  const toggleZoom = useCallback(() => {
    const targetScale = isZoomed ? 1 : coverScale.value;
    scale.value = withTiming(targetScale, TIMING_CONFIG);
    translateX.value = withTiming(0, TIMING_CONFIG);
    translateY.value = withTiming(0, TIMING_CONFIG);
    savedScale.value = targetScale;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(!isZoomed);
  }, [isZoomed, scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY, coverScale]);

  /** Animate back to scale 1.0 with translate (0,0). */
  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, TIMING_CONFIG);
    translateX.value = withTiming(0, TIMING_CONFIG);
    translateY.value = withTiming(0, TIMING_CONFIG);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setIsZoomed(false);
  }, [scale, translateX, translateY, savedScale, savedTranslateX, savedTranslateY]);

  return {
    gesture,
    animatedStyle,
    isZoomed,
    toggleZoom,
    resetZoom,
  };
};
