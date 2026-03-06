import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system/next';

type CaptureOptions = {
  /** Output width in pixels. If provided, the capture is resized. */
  width?: number;
  /** Output height in pixels. If provided, the capture is resized. */
  height?: number;
};

/**
 * Captures the annotated video frame (video + SVG overlay) as a PNG
 * and saves it to the device's photo gallery.
 *
 * @param viewRef - Ref to the View compositing the frame image and drawing overlay.
 * @param options - Optional width/height to resize the output image.
 * @returns The gallery asset URI of the saved image.
 * @throws If media library permission is denied or capture fails.
 */
/**
 * Saves a raw base64 PNG string to the device's photo gallery.
 * Used on Android where captureRef can't see SVG content — the SVG is
 * composited via toDataURL() instead, producing a base64 PNG directly.
 *
 * @param base64Data - Raw base64-encoded PNG data (no data URI prefix).
 * @returns The gallery asset URI of the saved image.
 * @throws If media library permission is denied or save fails.
 */
export const saveBase64ImageToGallery = async (
  base64Data: string,
): Promise<string> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  const tempPath = `${FileSystem.cacheDirectory}annotated-frame-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(tempPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    const asset = await MediaLibrary.createAssetAsync(tempPath);
    return asset.uri;
  } finally {
    const tempFile = new File(tempPath);
    if (tempFile.exists) {
      tempFile.delete();
    }
  }
};

/**
 * Captures the annotated video frame (video + SVG overlay) as a PNG
 * and saves it to the device's photo gallery.
 *
 * @param viewRef - Ref to the View compositing the frame image and drawing overlay.
 * @param options - Optional width/height to resize the output image.
 * @returns The gallery asset URI of the saved image.
 * @throws If media library permission is denied or capture fails.
 */
export const captureAnnotatedFrame = async (
  viewRef: RefObject<View | null>,
  options?: CaptureOptions,
): Promise<string> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  const tempUri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    ...(options?.width && { width: options.width }),
    ...(options?.height && { height: options.height }),
  });

  try {
    const asset = await MediaLibrary.createAssetAsync(tempUri);
    return asset.uri;
  } finally {
    const tempFile = new File(tempUri);
    if (tempFile.exists) {
      tempFile.delete();
    }
  }
};

/**
 * Captures the annotated video frame as a PNG and returns the temp file path.
 * Caller is responsible for cleanup.
 *
 * @param viewRef - Ref to the View compositing the frame image and drawing overlay.
 * @param options - Optional width/height to resize the output image.
 * @returns The temp file path of the captured PNG.
 */
export const captureFrameToTempFile = async (
  viewRef: RefObject<View | null>,
  options?: CaptureOptions,
): Promise<string> => {
  return captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    ...(options?.width && { width: options.width }),
    ...(options?.height && { height: options.height }),
  });
};

/**
 * Writes a base64 PNG to a temp file, opens the native share sheet, then cleans up.
 *
 * @param base64Data - Raw base64-encoded PNG data (no data URI prefix).
 */
export const shareBase64Image = async (base64Data: string): Promise<void> => {
  const tempPath = `${FileSystem.cacheDirectory}share-frame-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(tempPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    await Sharing.shareAsync(tempPath, {
      mimeType: 'image/png',
      UTI: 'public.png',
    });
  } finally {
    const tempFile = new File(tempPath);
    if (tempFile.exists) {
      tempFile.delete();
    }
  }
};

/**
 * Opens the native share sheet for a temp file, then cleans up.
 *
 * @param tempPath - Path to a temp PNG file.
 */
export const shareTempFile = async (tempPath: string): Promise<void> => {
  try {
    await Sharing.shareAsync(tempPath, {
      mimeType: 'image/png',
      UTI: 'public.png',
    });
  } finally {
    const tempFile = new File(tempPath);
    if (tempFile.exists) {
      tempFile.delete();
    }
  }
};
