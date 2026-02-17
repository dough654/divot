export type NormalizedPoint = {
  x: number;
  y: number;
};

/** Detection result for a single frame where the club shaft was found. */
export type ShaftFrameResult = {
  /** Zero-based frame index in the video. */
  frameIndex: number;
  /** Timestamp in milliseconds from the start of the video. */
  timestampMs: number;
  /** Shaft angle in degrees. 0 = horizontal, 90 = vertical. */
  angleDegrees: number;
  /** Grip end of the shaft, normalized 0-1 relative to video frame. */
  startPoint: NormalizedPoint;
  /** Club head end of the shaft, normalized 0-1 relative to video frame. */
  endPoint: NormalizedPoint;
  /** Confidence score 0-1 based on elongation ratio of the detected blob. */
  confidence: number;
};

/** Full result returned from analyzing a clip. */
export type SwingAnalysisResult = {
  /** ID of the clip that was analyzed. */
  clipId: string;
  /** Total number of frames in the video. */
  totalFrames: number;
  /** Only frames where the shaft was successfully detected. */
  frames: ShaftFrameResult[];
  /** How long the analysis took in milliseconds. */
  analysisTimeMs: number;
  /** Resolution used for analysis. */
  analysisResolution: { width: number; height: number };
};

/** Progress event emitted during analysis. */
export type AnalysisProgressEvent = {
  /** Progress fraction 0-1. */
  progress: number;
  /** Current frame being processed. */
  currentFrame: number;
  /** Total frames to process. */
  totalFrames: number;
};
