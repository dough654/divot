import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Clip, ClipMetadata } from '@/src/types/recording';
import { deleteAnnotations } from '@/src/services/annotation/annotation-storage';

const CLIPS_DIR_NAME = 'clips';
const METADATA_KEY = '@swinglink/clips_metadata';
const CURRENT_VERSION = 1;

/**
 * Gets the clips directory, creating it if needed.
 */
const getClipsDirectory = (): Directory => {
  return new Directory(Paths.document, CLIPS_DIR_NAME);
};

/**
 * Ensures the clips directory exists.
 */
const ensureClipsDirectory = (): void => {
  const clipsDir = getClipsDirectory();
  if (!clipsDir.exists) {
    clipsDir.create();
  }
};

/**
 * Generates a unique clip ID.
 */
const generateClipId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};

/**
 * Loads clip metadata from storage.
 */
const loadMetadata = async (): Promise<ClipMetadata> => {
  try {
    const data = await AsyncStorage.getItem(METADATA_KEY);
    if (data) {
      return JSON.parse(data) as ClipMetadata;
    }
  } catch (err) {
    console.error('Failed to load clip metadata:', err);
  }
  return { clips: [], version: CURRENT_VERSION };
};

/**
 * Saves clip metadata to storage.
 */
const saveMetadata = async (metadata: ClipMetadata): Promise<void> => {
  try {
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch (err) {
    console.error('Failed to save clip metadata:', err);
    throw err;
  }
};

export type SaveClipOptions = {
  /** Source path of the recorded video. */
  path: string;
  /** Duration in seconds. */
  duration: number;
  /** Frame rate. */
  fps: number;
  /** Optional name for the clip. */
  name?: string;
};

/**
 * Converts a path to a file URI if needed.
 */
const toFileUri = (path: string): string => {
  if (path.startsWith('file://')) {
    return path;
  }
  return `file://${path}`;
};

/**
 * Saves a recorded clip to the app's storage.
 * Copies the video file to the clips directory and updates metadata.
 */
export const saveClip = async (options: SaveClipOptions): Promise<Clip> => {
  const { path: sourcePath, duration, fps, name } = options;

  ensureClipsDirectory();

  const clipId = generateClipId();
  const filename = `${clipId}.mp4`;
  const clipsDir = getClipsDirectory();
  const destinationFile = new File(clipsDir, filename);

  // Copy the source video file to our clips directory
  // VisionCamera returns raw paths on Android, need to convert to file:// URI
  const sourceUri = toFileUri(sourcePath);
  const sourceFile = new File(sourceUri);
  sourceFile.copy(destinationFile);

  // Get file info for size
  const fileSize = destinationFile.exists && destinationFile.size ? destinationFile.size : 0;

  const clip: Clip = {
    id: clipId,
    path: destinationFile.uri,
    duration,
    timestamp: Date.now(),
    fileSize,
    fps,
    name,
  };

  // Update metadata
  const metadata = await loadMetadata();
  metadata.clips.unshift(clip); // Add to beginning (most recent first)
  await saveMetadata(metadata);

  return clip;
};

/**
 * Lists all saved clips.
 */
export const listClips = async (): Promise<Clip[]> => {
  const metadata = await loadMetadata();
  return metadata.clips;
};

/**
 * Gets a clip by ID.
 */
export const getClip = async (clipId: string): Promise<Clip | null> => {
  const metadata = await loadMetadata();
  return metadata.clips.find((clip) => clip.id === clipId) || null;
};

/**
 * Deletes a clip by ID.
 */
export const deleteClip = async (clipId: string): Promise<boolean> => {
  const metadata = await loadMetadata();
  const clipIndex = metadata.clips.findIndex((clip) => clip.id === clipId);

  if (clipIndex === -1) {
    return false;
  }

  const clip = metadata.clips[clipIndex];

  // Delete the file
  try {
    const file = new File(clip.path);
    if (file.exists) {
      file.delete();
    }
  } catch (err) {
    console.error('Failed to delete clip file:', err);
  }

  // Delete associated annotations
  deleteAnnotations(clipId);

  // Update metadata
  metadata.clips.splice(clipIndex, 1);
  await saveMetadata(metadata);

  return true;
};

/**
 * Renames a clip.
 */
export const renameClip = async (clipId: string, newName: string): Promise<Clip | null> => {
  const metadata = await loadMetadata();
  const clip = metadata.clips.find((c) => c.id === clipId);

  if (!clip) {
    return null;
  }

  clip.name = newName;
  await saveMetadata(metadata);

  return clip;
};

/**
 * Saves a clip to the device's media library (photo/video gallery).
 */
export const saveClipToGallery = async (clipId: string): Promise<boolean> => {
  const clip = await getClip(clipId);
  if (!clip) {
    return false;
  }

  // Request media library permissions
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission denied');
  }

  // Save to gallery
  await MediaLibrary.saveToLibraryAsync(clip.path);

  return true;
};

/**
 * Gets total storage used by clips in bytes.
 */
export const getStorageUsed = async (): Promise<number> => {
  const metadata = await loadMetadata();
  return metadata.clips.reduce((total, clip) => total + clip.fileSize, 0);
};

/**
 * Clears all clips (for testing/debugging).
 */
export const clearAllClips = async (): Promise<void> => {
  const metadata = await loadMetadata();

  // Delete all files and annotations
  for (const clip of metadata.clips) {
    try {
      const file = new File(clip.path);
      if (file.exists) {
        file.delete();
      }
    } catch (err) {
      console.error('Failed to delete clip file:', err);
    }
    deleteAnnotations(clip.id);
  }

  // Clear metadata
  await saveMetadata({ clips: [], version: CURRENT_VERSION });
};
