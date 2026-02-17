/**
 * Computes the rendered rectangle of a video displayed in CONTAIN mode
 * within a container. When the video's aspect ratio differs from the
 * container's, there will be letterboxing (horizontal or vertical bars).
 *
 * Returns the offset and dimensions of the actual video content area
 * within the container.
 */
export const computeContainRect = (
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number; width: number; height: number } => {
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderedWidth: number;
  let renderedHeight: number;

  if (videoAspect > containerAspect) {
    // Video is wider than container — letterbox top/bottom
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / videoAspect;
  } else {
    // Video is taller than container — pillarbox left/right
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * videoAspect;
  }

  const x = (containerWidth - renderedWidth) / 2;
  const y = (containerHeight - renderedHeight) / 2;

  return { x, y, width: renderedWidth, height: renderedHeight };
};
