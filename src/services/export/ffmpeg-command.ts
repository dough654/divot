type OverlayContentRect = {
  /** X offset of the video content area within the overlay PNG. */
  x: number;
  /** Y offset of the video content area within the overlay PNG. */
  y: number;
  /** Width of the video content area within the overlay PNG. */
  width: number;
  /** Height of the video content area within the overlay PNG. */
  height: number;
};

type BuildOverlayCommandOptions = {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
  /** If provided, crops the overlay to the video content area and scales to match.
   *  Needed when the overlay includes letterbox bars from CONTAIN resize mode. */
  contentRect?: OverlayContentRect;
  /** Native video width — required when contentRect is provided. */
  videoWidth?: number;
  /** Native video height — required when contentRect is provided. */
  videoHeight?: number;
};

/**
 * Builds the FFmpeg command string to overlay a transparent PNG on every frame.
 * Pure function — no side effects, easily testable.
 *
 * When a contentRect is provided, the overlay PNG is cropped to just the
 * video content area (removing letterbox bars) and scaled to the video's
 * native resolution before compositing.
 */
export const buildOverlayCommand = ({
  videoPath,
  overlayPath,
  outputPath,
  contentRect,
  videoWidth,
  videoHeight,
}: BuildOverlayCommandOptions): string => {
  if (contentRect && videoWidth && videoHeight) {
    // Crop overlay to the video content area, then scale to native video resolution.
    // Use FFmpeg expressions with min() to clamp crop dimensions to the actual
    // overlay PNG size (iw/ih). JS rounding and toDataURL() may disagree by ±1px,
    // so letting FFmpeg clamp against the real input prevents "too big" errors.
    // Single quotes around min() expressions prevent the comma from being parsed
    // as an FFmpeg filter separator.
    const cropX = Math.round(contentRect.x);
    const cropY = Math.round(contentRect.y);
    const cropW = Math.round(contentRect.width);
    const cropH = Math.round(contentRect.height);
    const cropExpr = `crop='min(${cropW},iw-${cropX})':'min(${cropH},ih-${cropY})':${cropX}:${cropY}`;
    return [
      `-i "${videoPath}" -i "${overlayPath}"`,
      `-filter_complex "[1:v]${cropExpr},scale=${videoWidth}:${videoHeight}[ovr];[0:v][ovr]overlay=0:0"`,
      `-c:a copy -y "${outputPath}"`,
    ].join(' ');
  }

  return `-i "${videoPath}" -i "${overlayPath}" -filter_complex "[0:v][1:v]overlay=0:0" -c:a copy -y "${outputPath}"`;
};

type BuildCopyCommandOptions = {
  videoPath: string;
  outputPath: string;
};

/**
 * Builds an FFmpeg command to copy a video without any overlay.
 * Uses stream copy (no re-encoding) for maximum speed.
 */
export const buildCopyCommand = ({
  videoPath,
  outputPath,
}: BuildCopyCommandOptions): string => {
  return `-i "${videoPath}" -c copy -y "${outputPath}"`;
};
