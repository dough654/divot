export type PreviewTransform = {
  /** CSS rotation string, e.g. '-90deg'. */
  rotate: string;
  /** Scale factor to fill the container after rotation. */
  scale: number;
};

/**
 * Computes the counter-rotation transform needed to correct the Android
 * VisionCamera preview when the device is rotated.
 *
 * The camera preview SurfaceView on Android doesn't auto-rotate with the UI
 * lock — it renders based on the sensor orientation. This function returns
 * the inverse transform so the preview appears upright.
 *
 * @param rotationDegrees - Clockwise rotation from the frame processor (0, 90, 180, 270).
 * @param containerWidth  - Width of the camera container in layout pixels.
 * @param containerHeight - Height of the camera container in layout pixels.
 * @returns A transform to apply, or null if no correction is needed (0°).
 */
export const getPreviewTransform = (
  rotationDegrees: number,
  containerWidth: number,
  containerHeight: number,
): PreviewTransform | null => {
  switch (rotationDegrees) {
    case 0:
      return null;
    case 90:
      return {
        rotate: '-90deg',
        scale: containerHeight / containerWidth,
      };
    case 180:
      return {
        rotate: '180deg',
        scale: 1,
      };
    case 270:
      return {
        rotate: '90deg',
        scale: containerHeight / containerWidth,
      };
    default:
      return null;
  }
};
