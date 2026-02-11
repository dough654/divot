import type { JointName, JointPosition, PoseFrame } from '@/src/types/pose';

/**
 * Ordered list of joint names matching the native plugin's flat array layout.
 * Index × 3 = offset into the 42-element flat array (x, y, confidence per joint).
 */
export const JOINT_NAMES: JointName[] = [
  'nose',
  'neck',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

/**
 * Pairs of joint names defining the skeleton connections for drawing lines.
 * Each tuple represents a bone/connection between two joints.
 */
export const SKELETON_CONNECTIONS: [JointName, JointName][] = [
  // Head to torso
  ['nose', 'neck'],
  // Shoulders
  ['neck', 'leftShoulder'],
  ['neck', 'rightShoulder'],
  // Left arm
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  // Right arm
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  // Torso to hips
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  // Left leg
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  // Right leg
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

/** Expected length of the flat pose array from the native plugin (14 joints × 3 values). */
export const POSE_ARRAY_LENGTH = JOINT_NAMES.length * 3;

/**
 * Parses the flat 42-element number array from the native pose detection plugin
 * into a structured PoseFrame.
 *
 * @param data - Flat array of [x, y, confidence] × 14 joints
 * @param timestamp - Frame timestamp in milliseconds
 * @returns Parsed PoseFrame, or null if data is invalid
 */
export const parsePoseArray = (data: number[], timestamp: number): PoseFrame | null => {
  if (data.length !== POSE_ARRAY_LENGTH) {
    return null;
  }

  const joints = {} as Record<JointName, JointPosition>;

  for (let i = 0; i < JOINT_NAMES.length; i++) {
    const offset = i * 3;
    joints[JOINT_NAMES[i]] = {
      x: data[offset],
      y: data[offset + 1],
      confidence: data[offset + 2],
    };
  }

  return { timestamp, joints };
};
