import { File, Directory, Paths } from 'expo-file-system';
import type { SwingAnalysisResult } from '../../../modules/swing-analysis/src/types';
import type { PersistedSwingAnalysis } from '@/src/types/swing-analysis';

const ANALYSIS_DIR_NAME = 'analysis';
const CURRENT_VERSION = 1;

/**
 * Gets the analysis directory.
 */
const getAnalysisDirectory = (): Directory => {
  return new Directory(Paths.document, ANALYSIS_DIR_NAME);
};

/**
 * Ensures the analysis directory exists.
 */
const ensureAnalysisDirectory = (): void => {
  const analysisDir = getAnalysisDirectory();
  if (!analysisDir.exists) {
    analysisDir.create();
  }
};

/**
 * Returns the analysis file name for a given clip ID.
 */
const getAnalysisFilename = (clipId: string): string => {
  return `${clipId}_analysis.json`;
};

/**
 * Saves an analysis result for a clip. Overwrites any existing analysis.
 */
export const saveAnalysis = (clipId: string, result: SwingAnalysisResult): void => {
  ensureAnalysisDirectory();
  const analysisDir = getAnalysisDirectory();
  const file = new File(analysisDir, getAnalysisFilename(clipId));

  const persisted: PersistedSwingAnalysis = {
    clipId,
    analyzedAt: Date.now(),
    result,
    version: CURRENT_VERSION,
  };

  file.write(JSON.stringify(persisted));
};

/**
 * Loads a saved analysis for a clip.
 * Returns null if no analysis exists.
 */
export const loadAnalysis = async (clipId: string): Promise<PersistedSwingAnalysis | null> => {
  const analysisDir = getAnalysisDirectory();
  const file = new File(analysisDir, getAnalysisFilename(clipId));

  if (!file.exists) {
    return null;
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as PersistedSwingAnalysis;
  } catch (err) {
    console.error('Failed to load analysis:', err);
    return null;
  }
};

/**
 * Deletes the analysis file for a clip.
 * Safe to call even if no analysis exists.
 */
export const deleteAnalysis = (clipId: string): void => {
  const analysisDir = getAnalysisDirectory();
  const file = new File(analysisDir, getAnalysisFilename(clipId));

  if (file.exists) {
    try {
      file.delete();
    } catch (err) {
      console.error('Failed to delete analysis:', err);
    }
  }
};
