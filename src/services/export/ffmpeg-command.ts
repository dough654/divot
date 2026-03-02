type BuildOverlayCommandOptions = {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
  /** Native video width — used to scale the overlay to match. */
  videoWidth?: number;
  /** Native video height — used to scale the overlay to match. */
  videoHeight?: number;
};

/**
 * Builds the FFmpeg command string to overlay a transparent PNG on every frame.
 * Pure function — no side effects, easily testable.
 *
 * The overlay PNG is expected to already cover only the video content area
 * (no letterbox bars). It is scaled to the video's native resolution before compositing.
 */
export const buildOverlayCommand = ({
  videoPath,
  overlayPath,
  outputPath,
  videoWidth,
  videoHeight,
}: BuildOverlayCommandOptions): string => {
  if (videoWidth && videoHeight) {
    return [
      `-i "${videoPath}" -i "${overlayPath}"`,
      `-filter_complex "[1:v]scale=${videoWidth}:${videoHeight}[ovr];[0:v][ovr]overlay=0:0"`,
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
