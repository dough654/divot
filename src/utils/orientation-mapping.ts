/**
 * Reference implementation documenting how device orientation maps to
 * WebRTC video rotation degrees on iOS and Android.
 *
 * The native frame processor plugins (Swift/Kotlin) perform this mapping
 * at the native layer. This JS module serves as documentation and enables
 * unit testing of the rotation semantics.
 */

type DeviceOrientation = 'portrait' | 'landscape-left' | 'landscape-right' | 'portrait-upside-down';

/**
 * Maps a physical device orientation to the WebRTC rotation degrees needed
 * to display the video frame upright.
 *
 * WebRTC rotation is defined as clockwise degrees the frame must be rotated
 * to appear correctly oriented to the viewer.
 *
 * @param orientation - The physical device orientation
 * @returns Rotation in degrees (0, 90, 180, or 270)
 */
const orientationToRotationDegrees = (orientation: DeviceOrientation): number => {
  const mapping: Record<DeviceOrientation, number> = {
    'portrait': 0,
    'landscape-right': 90,
    'portrait-upside-down': 180,
    'landscape-left': 270,
  };

  return mapping[orientation];
};

/**
 * Maps WebRTC rotation degrees back to a device orientation.
 * Inverse of orientationToRotationDegrees.
 *
 * @param degrees - Rotation in degrees (0, 90, 180, or 270)
 * @returns The corresponding device orientation, or 'portrait' for invalid values
 */
const rotationDegreesToOrientation = (degrees: number): DeviceOrientation => {
  const normalized = ((degrees % 360) + 360) % 360;

  const mapping: Record<number, DeviceOrientation> = {
    0: 'portrait',
    90: 'landscape-right',
    180: 'portrait-upside-down',
    270: 'landscape-left',
  };

  return mapping[normalized] ?? 'portrait';
};

/**
 * Checks whether a rotation degree value is a valid WebRTC rotation.
 *
 * @param degrees - The rotation value to check
 * @returns true if the value is 0, 90, 180, or 270
 */
const isValidRotation = (degrees: number): boolean => {
  return [0, 90, 180, 270].includes(degrees);
};

export {
  orientationToRotationDegrees,
  rotationDegreesToOrientation,
  isValidRotation,
};

export type { DeviceOrientation };
