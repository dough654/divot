/** A single frame's pose detection result. */
export type PoseFrame = {
  /** Zero-based index of this frame in the video. */
  frameIndex: number;
  /** Timestamp of this frame in milliseconds. */
  timestampMs: number;
  /** 72 values: [x, y, confidence] × 24 joints. Normalized 0-1. */
  landmarks: number[];
};

/** Result of analyzing a full video clip for pose data. */
export type VideoPoseAnalysisResult = {
  /** ID of the analyzed clip. */
  clipId: string;
  /** Total number of frames in the video. */
  totalFrames: number;
  /** Number of frames where pose was successfully detected. */
  analyzedFrames: number;
  /** Per-frame pose landmarks for frames with successful detection. */
  frames: PoseFrame[];
  /** Time taken for the full analysis in milliseconds. */
  analysisTimeMs: number;
  /** Native frame rate of the video. */
  fps: number;
  /** Resolution the video was analyzed at. */
  resolution: { width: number; height: number };
};

/** Progress event emitted during analysis. */
export type PoseAnalysisProgressEvent = {
  /** Progress from 0 to 1. */
  progress: number;
  /** Current frame being processed. */
  currentFrame: number;
  /** Total frames to process. */
  totalFrames: number;
};
