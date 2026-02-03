import { File, Directory, Paths } from 'expo-file-system';
import type { Annotation } from '@/src/types/annotation';

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
 * Migrates a raw parsed annotation by assigning `type: 'freehand'` if the
 * type field is missing (legacy data written before the tool system existed).
 */
const migrateAnnotation = (raw: Record<string, unknown>): Annotation => {
  if (!raw.type) {
    return { ...raw, type: 'freehand' } as Annotation;
  }
  return raw as Annotation;
};

/**
 * Saves annotations for a clip. Overwrites any existing annotations.
 */
export const saveAnnotations = (clipId: string, annotations: Annotation[]): void => {
  ensureAnnotationsDirectory();
  const annotationsDir = getAnnotationsDirectory();
  const file = new File(annotationsDir, getAnnotationFilename(clipId));
  file.write(JSON.stringify(annotations));
};

/**
 * Loads saved annotations for a clip.
 * Returns an empty array if no annotations exist.
 * Migrates legacy annotations that lack a `type` field.
 */
export const loadAnnotations = async (clipId: string): Promise<Annotation[]> => {
  const annotationsDir = getAnnotationsDirectory();
  const file = new File(annotationsDir, getAnnotationFilename(clipId));

  if (!file.exists) {
    return [];
  }

  try {
    const content = await file.text();
    const raw = JSON.parse(content) as Record<string, unknown>[];
    return raw.map(migrateAnnotation);
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
