export type {
  NormalizedPoint,
  ShaftFrameResult,
  SwingAnalysisResult,
  AnalysisProgressEvent,
} from '../../modules/swing-analysis/src/types';

import type { SwingAnalysisResult } from '../../modules/swing-analysis/src/types';
import type { VideoPoseAnalysisResult } from '../../modules/video-pose-analysis/src/types';

/** Persisted analysis result stored alongside clip data. */
export type PersistedSwingAnalysis = {
  /** ID of the analyzed clip. */
  clipId: string;
  /** Unix timestamp of when the analysis was performed. */
  analyzedAt: number;
  /** The analysis result data. */
  result: SwingAnalysisResult;
  /** Schema version for future migrations. */
  version: number;
};

/** Persisted pose analysis result stored as a separate file per clip. */
export type PersistedPoseAnalysis = {
  /** ID of the analyzed clip. */
  clipId: string;
  /** Unix timestamp of when the analysis was performed. */
  analyzedAt: number;
  /** The pose analysis result data. */
  result: VideoPoseAnalysisResult;
  /** Schema version for future migrations. */
  version: number;
};
