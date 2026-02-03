import { File, Directory, Paths } from 'expo-file-system';
import type { AnnotationLine } from '@/src/types/annotation';

const ANNOTATIONS_DIR_NAME = 'annotations';

/**
 * Gets the annotations directory, creating it if needed.
 */
const getAnnotationsDirectory = (): Directory => {
  return new Directory(Paths.document, ANNOTATIONS_DIR_NAME);
};

/**
 * Ensures the annotations directory exists.
 */
const ensureAnnotationsDirectory = (): void => {
  const annotationsDir = getAnnotationsDirectory();
  if (!annotationsDir.exists) {
    annotationsDir.create();
  }
};

/**
 * Returns the annotation file name for a given clip ID.
 */
const getAnnotationFilename = (clipId: string): string => {
  return `${clipId}_annotations.json`;
};

/**
 * Saves annotations for a clip. Overwrites any existing annotations.
 */
export const saveAnnotations = (clipId: string, lines: AnnotationLine[]): void => {
  ensureAnnotationsDirectory();
  const annotationsDir = getAnnotationsDirectory();
  const file = new File(annotationsDir, getAnnotationFilename(clipId));
  file.write(JSON.stringify(lines));
};

/**
 * Loads saved annotations for a clip.
 * Returns an empty array if no annotations exist.
 */
export const loadAnnotations = async (clipId: string): Promise<AnnotationLine[]> => {
  const annotationsDir = getAnnotationsDirectory();
  const file = new File(annotationsDir, getAnnotationFilename(clipId));

  if (!file.exists) {
    return [];
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as AnnotationLine[];
  } catch (err) {
    console.error('Failed to load annotations:', err);
    return [];
  }
};

/**
 * Deletes the annotation file for a clip.
 * Safe to call even if no annotations exist.
 */
export const deleteAnnotations = (clipId: string): void => {
  const annotationsDir = getAnnotationsDirectory();
  const file = new File(annotationsDir, getAnnotationFilename(clipId));

  if (file.exists) {
    try {
      file.delete();
    } catch (err) {
      console.error('Failed to delete annotations:', err);
    }
  }
};
