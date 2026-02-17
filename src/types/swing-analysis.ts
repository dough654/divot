export type {
  NormalizedPoint,
  ShaftFrameResult,
  SwingAnalysisResult,
  AnalysisProgressEvent,
} from '../../modules/swing-analysis/src/types';

import type { SwingAnalysisResult } from '../../modules/swing-analysis/src/types';

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
