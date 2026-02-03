import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

/**
 * Captures the annotated video frame (video + SVG overlay) as a PNG
 * and saves it to the device's photo gallery.
 *
 * @param viewRef - Ref to the View compositing the video and drawing overlay.
 * @returns The gallery asset URI of the saved image.
 * @throws If media library permission is denied or capture fails.
 */
export const captureAnnotatedFrame = async (
  viewRef: RefObject<View | null>,
): Promise<string> => {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  const tempUri = await captureRef(viewRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  try {
    const asset = await MediaLibrary.createAssetAsync(tempUri);
    return asset.uri;
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true });
  }
};
