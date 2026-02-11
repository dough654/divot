export type ZoomDimensions = {
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
};

/**
 * Computes the scale factor that makes a "contain"-mode video visually fill
 * its container (equivalent to "cover" mode).
 *
 * Returns 1.0 if dimensions are zero or the aspect ratios already match.
 */
export const computeCoverScale = (dims: ZoomDimensions): number => {
  const { containerWidth, containerHeight, videoWidth, videoHeight } = dims;

  if (containerWidth <= 0 || containerHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return 1;
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  // Pillarboxed (video narrower than container) → scale up by aspect ratio
  // Letterboxed (video wider than container) → scale up by inverse ratio
  return videoAspect > containerAspect
    ? videoAspect / containerAspect
    : containerAspect / videoAspect;
};

/**
 * Computes the maximum allowed translation on each axis so that the video
 * edges never pull inward past the container edges.
 *
 * At scale 1.0 (contain), both limits are 0 — no panning possible.
 */
export const computeMaxTranslation = (
  dims: ZoomDimensions,
  scale: number,
): { maxTranslateX: number; maxTranslateY: number } => {
  const { containerWidth, containerHeight, videoWidth, videoHeight } = dims;

  if (containerWidth <= 0 || containerHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
    return { maxTranslateX: 0, maxTranslateY: 0 };
  }

  const videoAspect = videoWidth / videoHeight;

  // Size of the video as rendered in "contain" mode (before zoom transforms)
  const renderedWidth = Math.min(containerWidth, containerHeight * videoAspect);
  const renderedHeight = Math.min(containerHeight, containerWidth / videoAspect);

  // After scaling, the overflow on each side determines pan range
  const maxTranslateX = Math.max(0, (renderedWidth * scale - containerWidth) / 2);
  const maxTranslateY = Math.max(0, (renderedHeight * scale - containerHeight) / 2);

  return { maxTranslateX, maxTranslateY };
};

/**
 * Clamps a translation value to the range [-limit, +limit].
 */
export const clampTranslation = (value: number, limit: number): number => {
  if (limit <= 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
};
