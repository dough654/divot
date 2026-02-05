import { useState, useCallback, useEffect } from 'react';
import {
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  CameraDevice,
  CameraPosition,
} from 'react-native-vision-camera';

export type UseVisionCameraOptions = {
  /** Initial camera position. Defaults to 'back'. */
  initialPosition?: CameraPosition;
  /** Whether to request permissions automatically. Defaults to true. */
  autoRequestPermissions?: boolean;
};

export type UseVisionCameraResult = {
  /** The selected camera device, or undefined if not available. */
  device: CameraDevice | undefined;
  /** Whether camera permission is granted. */
  hasCameraPermission: boolean;
  /** Whether microphone permission is granted. */
  hasMicrophonePermission: boolean;
  /** Current camera position. */
  position: CameraPosition;
  /** Whether the camera is the front-facing camera. */
  isFrontCamera: boolean;
  /** Whether permissions are still being requested. */
  isRequestingPermissions: boolean;
  /** Error message if permissions denied or no device available. */
  error: string | null;
  /** Request camera and microphone permissions. */
  requestPermissions: () => Promise<boolean>;
  /** Toggle between front and back camera. */
  toggleCamera: () => void;
  /** Set specific camera position. */
  setPosition: (position: CameraPosition) => void;
};

/**
 * Hook for managing VisionCamera device selection and permissions.
 * Handles permission requests and camera switching.
 */
export const useVisionCamera = (
  options: UseVisionCameraOptions = {}
): UseVisionCameraResult => {
  const { initialPosition = 'back', autoRequestPermissions = true } = options;

  const [position, setPosition] = useState<CameraPosition>(initialPosition);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const device = useCameraDevice(position);
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } =
    useMicrophonePermission();

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    setIsRequestingPermissions(true);
    setHasRequestedPermissions(true);
    setError(null);

    try {
      const cameraGranted = await requestCameraPermission();
      const micGranted = await requestMicrophonePermission();

      if (!cameraGranted) {
        setError('Camera permission denied. Please enable it in settings.');
        return false;
      }

      if (!micGranted) {
        // Don't set error here - camera.tsx handles the Alert for microphone
        // Still return true - we can record without audio
      }

      return cameraGranted;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request permissions';
      setError(errorMessage);
      return false;
    } finally {
      setIsRequestingPermissions(false);
    }
  }, [requestCameraPermission, requestMicrophonePermission]);

  const toggleCamera = useCallback(() => {
    setPosition((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  // Auto-request permissions on mount if either is missing (only once per session)
  useEffect(() => {
    if (
      autoRequestPermissions &&
      !hasRequestedPermissions &&
      (!hasCameraPermission || !hasMicrophonePermission)
    ) {
      requestPermissions();
    }
  }, [autoRequestPermissions, hasRequestedPermissions, hasCameraPermission, hasMicrophonePermission, requestPermissions]);

  // Check for device availability
  useEffect(() => {
    if (hasCameraPermission && !device) {
      setError(`No ${position} camera available on this device.`);
    } else if (hasCameraPermission && device) {
      setError(null);
    }
  }, [hasCameraPermission, device, position]);

  return {
    device,
    hasCameraPermission,
    hasMicrophonePermission,
    position,
    isFrontCamera: position === 'front',
    isRequestingPermissions,
    error,
    requestPermissions,
    toggleCamera,
    setPosition,
  };
};
