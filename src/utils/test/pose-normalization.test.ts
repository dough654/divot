import { describe, it, expect } from 'vitest';
import {
  parsePoseArray,
  JOINT_NAMES,
  SKELETON_CONNECTIONS,
  POSE_ARRAY_LENGTH,
} from '../pose-normalization';

describe('JOINT_NAMES', () => {
  it('has 14 joint names', () => {
    expect(JOINT_NAMES).toHaveLength(14);
  });

  it('starts with nose and ends with rightAnkle', () => {
    expect(JOINT_NAMES[0]).toBe('nose');
    expect(JOINT_NAMES[13]).toBe('rightAnkle');
  });

  it('contains all expected joints', () => {
    expect(JOINT_NAMES).toContain('leftWrist');
    expect(JOINT_NAMES).toContain('rightWrist');
    expect(JOINT_NAMES).toContain('neck');
  });
});

describe('SKELETON_CONNECTIONS', () => {
  it('has 14 connections', () => {
    expect(SKELETON_CONNECTIONS).toHaveLength(14);
  });

  it('only references valid joint names', () => {
    for (const [a, b] of SKELETON_CONNECTIONS) {
      expect(JOINT_NAMES).toContain(a);
      expect(JOINT_NAMES).toContain(b);
    }
  });
});

describe('POSE_ARRAY_LENGTH', () => {
  it('equals 42 (14 joints × 3)', () => {
    expect(POSE_ARRAY_LENGTH).toBe(42);
  });
});

describe('parsePoseArray', () => {
  const makeValidArray = (): number[] => {
    const data: number[] = [];
    for (let i = 0; i < 14; i++) {
      data.push(i * 0.07, i * 0.07, 0.9); // x, y, confidence
    }
    return data;
  };

  it('returns null for wrong-length arrays', () => {
    expect(parsePoseArray([], 0)).toBeNull();
    expect(parsePoseArray([1, 2, 3], 0)).toBeNull();
    expect(parsePoseArray(new Array(41).fill(0), 0)).toBeNull();
    expect(parsePoseArray(new Array(43).fill(0), 0)).toBeNull();
  });

  it('parses a valid 42-element array into a PoseFrame', () => {
    const data = makeValidArray();
    const result = parsePoseArray(data, 12345);

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(12345);
    expect(Object.keys(result!.joints)).toHaveLength(14);
  });

  it('maps joint positions correctly from flat array offsets', () => {
    const data = new Array(42).fill(0);
    // Set nose (index 0): x=0.1, y=0.2, confidence=0.95
    data[0] = 0.1;
    data[1] = 0.2;
    data[2] = 0.95;
    // Set rightWrist (index 7): x=0.5, y=0.6, confidence=0.8
    data[21] = 0.5;
    data[22] = 0.6;
    data[23] = 0.8;

    const result = parsePoseArray(data, 1000);
    expect(result).not.toBeNull();

    expect(result!.joints.nose.x).toBe(0.1);
    expect(result!.joints.nose.y).toBe(0.2);
    expect(result!.joints.nose.confidence).toBe(0.95);

    expect(result!.joints.rightWrist.x).toBe(0.5);
    expect(result!.joints.rightWrist.y).toBe(0.6);
    expect(result!.joints.rightWrist.confidence).toBe(0.8);
  });

  it('handles zeroed data (no detection)', () => {
    const data = new Array(42).fill(0);
    const result = parsePoseArray(data, 0);

    expect(result).not.toBeNull();
    for (const jointName of JOINT_NAMES) {
      expect(result!.joints[jointName].x).toBe(0);
      expect(result!.joints[jointName].y).toBe(0);
      expect(result!.joints[jointName].confidence).toBe(0);
    }
  });

  it('preserves all joint names from JOINT_NAMES', () => {
    const data = makeValidArray();
    const result = parsePoseArray(data, 0);

    expect(result).not.toBeNull();
    for (const jointName of JOINT_NAMES) {
      expect(result!.joints[jointName]).toBeDefined();
    }
  });
});
