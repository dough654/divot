import { useState, useCallback, useEffect } from 'react';
import {
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  CameraDevice,
  CameraDeviceFormat,
  CameraPosition,
} from 'react-native-vision-camera';
import { useSettings, RECORDING_FPS_VALUES, RECORDING_RESOLUTION_VALUES, RESOLUTION_DIMENSIONS } from '@/src/context';
import type { RecordingFps, RecordingResolution } from '@/src/context';

export type UseVisionCameraOptions = {
  /** Initial camera position. Defaults to 'back'. */
  initialPosition?: CameraPosition;
  /** Whether to request permissions automatically. Defaults to true. */
  autoRequestPermissions?: boolean;
  /** Target recording fps. When provided, selects the best matching camera format. */
  targetFps?: number;
  /** Target recording resolution. When provided, selects the best matching camera format. */
  targetResolution?: RecordingResolution;
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
  const { initialPosition = 'back', autoRequestPermissions = true, targetFps, targetResolution } = options;

  const [position, setPosition] = useState<CameraPosition>(initialPosition);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setSupportedRecordingFps, setSupportedRecordingResolutions } = useSettings();

  const resolutionDimensions = targetResolution
    ? RESOLUTION_DIMENSIONS[targetResolution]
    : RESOLUTION_DIMENSIONS['1080p'];

  const device = useCameraDevice(position);

  // Select best format: prefer target resolution, then closest fps match.
  const format = useCameraFormat(device, targetFps
    ? [{ videoResolution: resolutionDimensions }, { fps: targetFps }]
    : [{ videoResolution: resolutionDimensions }],
  );
  const actualFps = format && targetFps ? Math.min(targetFps, format.maxFps) : 30;

  // Detect which fps values this device supports and push to settings context
  useEffect(() => {
    if (!device) return;

    // DEBUG: dump format details to diagnose FPS detection
    console.log(`[VisionCamera] Device "${device.name}" (${device.position}) — ${device.formats.length} formats`);
    const uniqueFps = new Set<string>();
    for (const f of device.formats) {
      const key = `${f.videoWidth}x${f.videoHeight} minFps=${f.minFps} maxFps=${f.maxFps}`;
      uniqueFps.add(key);
    }
    // Log unique combos (deduplicated)
    const sorted = [...uniqueFps].sort();
    console.log(`[VisionCamera] Unique format combos (${sorted.length}):`);
    for (const entry of sorted) {
      console.log(`  ${entry}`);
    }
    // Also dump the raw first 5 formats to see all available fields
    for (let i = 0; i < Math.min(5, device.formats.length); i++) {
      console.log(`[VisionCamera] Raw format[${i}]: ${JSON.stringify(device.formats[i])}`);
    }

    const supported = RECORDING_FPS_VALUES.filter((fps) =>
      device.formats.some((f) => f.maxFps >= fps)
    ) as RecordingFps[];
    console.log(`[VisionCamera] Supported recording FPS: ${(supported.length > 0 ? supported : [30]).join(', ')}`);
    setSupportedRecordingFps(supported.length > 0 ? supported : [30]);

    // Detect which resolution values this device supports
    const supportedResolutions = RECORDING_RESOLUTION_VALUES.filter((res) => {
      const dims = RESOLUTION_DIMENSIONS[res];
      return device.formats.some((f) => f.videoWidth >= dims.width && f.videoHeight >= dims.height);
    });
    console.log(`[VisionCamera] Supported recording resolutions: ${(supportedResolutions.length > 0 ? supportedResolutions : ['1080p']).join(', ')}`);
    setSupportedRecordingResolutions(supportedResolutions.length > 0 ? supportedResolutions : ['1080p']);
  }, [device, setSupportedRecordingFps, setSupportedRecordingResolutions]);
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    setIsRequestingPermissions(true);
    setHasRequestedPermissions(true);
    setError(null);

    try {
      const cameraGranted = await requestCameraPermission();

      if (!cameraGranted) {
        setError('Camera permission denied. Please enable it in settings.');
        return false;
      }

      return cameraGranted;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request permissions';
      setError(errorMessage);
      return false;
    } finally {
      setIsRequestingPermissions(false);
    }
  }, [requestCameraPermission]);

  const toggleCamera = useCallback(() => {
    setPosition((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  // Auto-request permissions on mount if camera permission is missing (only once per session)
  useEffect(() => {
    if (
      autoRequestPermissions &&
      !hasRequestedPermissions &&
      !hasCameraPermission
    ) {
      requestPermissions();
    }
  }, [autoRequestPermissions, hasRequestedPermissions, hasCameraPermission, requestPermissions]);

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
    position,
    isFrontCamera: position === 'front',
    isRequestingPermissions,
    error,
    requestPermissions,
    toggleCamera,
    setPosition,
  };
};
