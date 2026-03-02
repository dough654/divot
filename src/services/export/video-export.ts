import { FFmpegKit, FFmpegKitConfig, ReturnCode } from 'ffmpeg-kit-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system/next';
import { buildOverlayCommand, buildCopyCommand } from './ffmpeg-command';

export { buildOverlayCommand, buildCopyCommand } from './ffmpeg-command';

type ExportOptions = {
  /** Path to the source video file. */
  videoPath: string;
  /** Path to the transparent PNG overlay. When omitted, video is copied without overlay. */
  overlayPngPath?: string;
  /** Path for the output .mp4. */
  outputPath: string;
  /** Estimated duration in ms (for progress calculation). */
  durationMs: number;
  /** Progress callback (0-1). */
  onProgress?: (fraction: number) => void;
  /** Native video width. */
  videoWidth?: number;
  /** Native video height. */
  videoHeight?: number;
};

/**
 * Executes the FFmpeg overlay command and reports progress.
 * Returns the session ID for cancellation.
 */
export const exportAnnotatedVideo = async ({
  videoPath,
  overlayPngPath,
  outputPath,
  durationMs,
  onProgress,
  videoWidth,
  videoHeight,
}: ExportOptions): Promise<{ sessionId: number }> => {
  const command = overlayPngPath
    ? buildOverlayCommand({
        videoPath,
        overlayPath: overlayPngPath,
        outputPath,
        videoWidth,
        videoHeight,
      })
    : buildCopyCommand({ videoPath, outputPath });

  if (onProgress) {
    FFmpegKitConfig.enableStatisticsCallback((statistics) => {
      const timeMs = statistics.getTime();
      if (durationMs > 0 && timeMs >= 0) {
        const fraction = Math.min(timeMs / durationMs, 1);
        onProgress(fraction);
      }
    });
  }

  const session = await FFmpegKit.execute(command);
  const returnCode = await session.getReturnCode();
  const sessionId = session.getSessionId();

  if (ReturnCode.isCancel(returnCode)) {
    throw new CancelledError('Export cancelled');
  }

  if (!ReturnCode.isSuccess(returnCode)) {
    const logs = await session.getLogsAsString();
    throw new Error(`FFmpeg failed (rc=${returnCode}): ${logs?.slice(0, 200)}`);
  }

  return { sessionId };
};

/**
 * Cancels a running FFmpeg session by ID.
 */
export const cancelExport = (sessionId: number): void => {
  FFmpegKit.cancel(sessionId);
};

/**
 * Saves the exported video to the device's photo gallery.
 */
export const saveExportToGallery = async (outputPath: string): Promise<string> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  const asset = await MediaLibrary.createAssetAsync(outputPath);
  return asset.uri;
};

/**
 * Opens the native share sheet for the exported video.
 */
export const shareExport = async (outputPath: string): Promise<void> => {
  await Sharing.shareAsync(outputPath, {
    mimeType: 'video/mp4',
    UTI: 'public.mpeg-4',
  });
};

/**
 * Deletes temporary export files. Silently ignores missing files.
 */
export const cleanupExportFiles = (paths: string[]): void => {
  for (const path of paths) {
    try {
      const file = new File(path);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Writes a base64 PNG string to a temp file.
 * Returns the file path.
 */
export const writeOverlayPng = async (base64Data: string): Promise<string> => {
  const path = `${FileSystem.cacheDirectory}export-overlay-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(path, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
};

/**
 * Generates an output path for the exported video.
 */
export const getExportOutputPath = (): string => {
  return `${FileSystem.cacheDirectory}divot-export-${Date.now()}.mp4`;
};

/** Sentinel error for cancelled exports. */
export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}
