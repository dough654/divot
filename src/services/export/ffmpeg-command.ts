/**
 * Builds the FFmpeg command string to overlay a transparent PNG on every frame.
 * Pure function — no side effects, easily testable.
 *
 * @param videoPath - Path to the source video file.
 * @param overlayPath - Path to the transparent PNG overlay image.
 * @param outputPath - Desired output file path.
 * @returns The FFmpeg command string.
 */
export const buildOverlayCommand = (
  videoPath: string,
  overlayPath: string,
  outputPath: string,
): string => {
  return `-i "${videoPath}" -i "${overlayPath}" -filter_complex "[0:v][1:v]overlay=0:0" -c:a copy -y "${outputPath}"`;
};
