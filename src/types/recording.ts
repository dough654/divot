/**
 * Recording state machine states.
 */
export type RecordingState = 'idle' | 'recording';

/**
 * Options for configuring video recording.
 */
export type RecordingOptions = {
  /** Enable audio recording. Defaults to true. */
  enableAudio?: boolean;
  /** Target frame rate for high-fps recording. Device may not support all values. */
  targetFps?: 30 | 60 | 120 | 240;
  /** Video codec to use. H.264 is more compatible, H.265 offers better compression. */
  videoCodec?: 'h264' | 'h265';
  /** Maximum duration in seconds. 0 for no limit. */
  maxDuration?: number;
};

/**
 * Represents a recorded video clip.
 */
export type Clip = {
  /** Unique identifier for the clip. */
  id: string;
  /** Local file path to the video. */
  path: string;
  /** Duration in seconds. */
  duration: number;
  /** Timestamp when recording started. */
  timestamp: number;
  /** File size in bytes. */
  fileSize: number;
  /** Frame rate the video was recorded at. */
  fps: number;
  /** Optional user-provided name. */
  name?: string;
};

/**
 * Metadata stored alongside clips for quick access without parsing video files.
 */
export type ClipMetadata = {
  /** List of all clips. */
  clips: Clip[];
  /** Version for future migrations. */
  version: number;
};
