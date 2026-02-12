import { useState, useCallback, useEffect } from 'react';
import {
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
  CameraDevice,
  CameraDeviceFormat,
  CameraPosition,
} from 'react-native-vision-camera';
import { useSettings, RECORDING_FPS_VALUES } from '@/src/context';
import type { RecordingFps } from '@/src/context';

export type UseVisionCameraOptions = {
  /** Initial camera position. Defaults to 'back'. */
  initialPosition?: CameraPosition;
  /** Whether to request permissions automatically. Defaults to true. */
  autoRequestPermissions?: boolean;
  /** Target recording fps. When provided, selects the best matching camera format. */
  targetFps?: number;
};

export type UseVisionCameraResult = {
  /** The selected camera device, or undefined if not available. */
  device: CameraDevice | undefined;
  /** The selected camera format for the target fps, or undefined. */
  format: CameraDeviceFormat | undefined;
  /** The actual fps the camera will record at (clamped to format max). */
  actualFps: number;
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
  const { initialPosition = 'back', autoRequestPermissions = true, targetFps } = options;

  const [position, setPosition] = useState<CameraPosition>(initialPosition);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setSupportedRecordingFps } = useSettings();

  const device = useCameraDevice(position);

  // Select best format: prefer highest resolution, then closest fps match.
  // Without a resolution preference VisionCamera can pick a tiny low-res format
  // (especially on front cameras where fewer high-fps formats exist).
  const format = useCameraFormat(device, targetFps
    ? [{ videoResolution: { width: 1920, height: 1080 } }, { fps: targetFps }]
    : [{ videoResolution: { width: 1920, height: 1080 } }],
  );
  const actualFps = format && targetFps ? Math.min(targetFps, format.maxFps) : 30;

  // Detect which fps values this device supports and push to settings context
  useEffect(() => {
    if (!device) return;
    const supported = RECORDING_FPS_VALUES.filter((fps) =>
      device.formats.some((f) => f.maxFps >= fps)
    ) as RecordingFps[];
    setSupportedRecordingFps(supported.length > 0 ? supported : [30]);
  }, [device, setSupportedRecordingFps]);
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
    format,
    actualFps,
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
