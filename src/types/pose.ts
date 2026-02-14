/** Joint names in the common 14-joint pose model. */
export type JointName =
  | 'nose'
  | 'neck'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle';

/** A single joint's position in normalized coordinates. */
export type JointPosition = {
  /** X coordinate, 0-1 normalized. */
  x: number;
  /** Y coordinate, 0-1 normalized. */
  y: number;
  /** Detection confidence, 0-1. */
  confidence: number;
};

/** A full pose estimation result for a single frame. */
export type PoseFrame = {
  /** Frame timestamp in milliseconds. */
  timestamp: number;
  /** Detected joints keyed by joint name. */
  joints: Record<JointName, JointPosition>;
};

/** States for the swing auto-detection state machine. */
export type SwingDetectionState =
  | 'idle'
  | 'armed'
  | 'detecting'
  | 'recording'
  | 'cooldown';

/** Configuration for the swing detection state machine. */
export type SwingDetectionConfig = {
  /** Wrist velocity threshold in normalized units/sec to trigger detection. */
  velocityThreshold: number;
  /** Size of the sliding confirmation window. */
  confirmationWindow: number;
  /** Minimum hits in window to confirm swing start. */
  confirmationHitsRequired: number;
  /** Number of consecutive frames below threshold to confirm swing end. */
  cooldownFrames: number;
  /** Pre-roll duration in milliseconds (for Phase C ring buffer). */
  preRollDurationMs: number;
  /** Post-roll duration in milliseconds after velocity drops. */
  postRollDurationMs: number;
  /** Minimum swing duration in milliseconds to avoid false positives. */
  minSwingDurationMs: number;
  /** Velocity multiplier for the initial trigger (armed → detecting). */
  initialTriggerMultiplier: number;
  /** Minimum upward (negative dy) fraction of total displacement during detection. */
  minUpwardFraction: number;
};

/** Events emitted by the swing detection state machine. */
export type SwingEvent =
  | { type: 'swingStarted'; timestamp: number }
  | { type: 'swingEnded'; timestamp: number; durationMs: number }
  | { type: 'swingCancelled'; reason: string };

/** States for the address position detection state machine. */
export type AddressDetectionState = 'watching' | 'confirming' | 'in-address';

/** Configuration for address position detection. */
export type AddressDetectionConfig = {
  /** Max distance between wrists (normalized coords). */
  wristProximityThreshold: number;
  /** Max average joint velocity for "still" (normalized units/poll). */
  stillnessThreshold: number;
  /** Consecutive polls meeting criteria to confirm address. */
  confirmationPolls: number;
  /** Consecutive polls with criteria broken to exit address. */
  exitPolls: number;
  /** Max vertical distance between avg wrist Y and avg hip Y (normalized). */
  wristHipVerticalThreshold: number;
};

/** Events emitted by the address detection state machine. */
export type AddressEvent =
  | { type: 'addressEntered' }
  | { type: 'addressExited' };
