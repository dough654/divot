import { StyleSheet, View, Platform } from 'react-native';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraDevice, CameraDeviceFormat, VideoFile, VisionCameraProxy, useFrameProcessor, runAtTargetFps } from 'react-native-vision-camera';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { File } from 'expo-file-system';
import { PoseOverlay } from './pose-overlay';

export type VisionCameraRecorderProps = {
  /** The camera device to use. */
  device: CameraDevice;
  /** Whether the camera is active. */
  isActive: boolean;
  /** Whether audio recording is enabled. Defaults to true. */
  audio?: boolean;
  /** Camera format for target fps. When omitted, uses device default. */
  format?: CameraDeviceFormat;
  /** Target recording fps. When omitted, uses device default. */
  fps?: number;
  /** Whether pose detection should run on frames. */
  poseDetectionEnabled?: boolean;
  /** Target fps for pose detection. Defaults to 10. */
  poseDetectionFps?: number;
  /** Whether the pose skeleton overlay is visible. */
  poseOverlayVisible?: boolean;
  /** Raw 42-element pose array for overlay rendering (polled from native by parent). */
  poseData?: number[] | null;
  /** Whether club detection should run on frames. */
  clubDetectionEnabled?: boolean;
  /** Target fps for club detection. Defaults to 3. */
  clubDetectionFps?: number;
  /** Whether frame differencing should run on frames. */
  frameDiffEnabled?: boolean;
  /** Target fps for frame differencing. Defaults to 15. */
  frameDiffFps?: number;
};

export type VisionCameraRecorderRef = {
  /** Start recording video. */
  startRecording: (options: {
    onRecordingFinished: (video: VideoFile) => void;
    onRecordingError: (error: unknown) => void;
  }) => void;
  /** Stop recording video and save the file. */
  stopRecording: () => Promise<void>;
  /** Cancel recording and discard the file. Triggers onRecordingError with code 'capture/recording-canceled'. */
  cancelRecording: () => Promise<void>;
  /** Capture a snapshot from the preview buffer and return it as a base64 JPEG string. */
  takeSnapshot: (options?: { quality?: number }) => Promise<string | null>;
};

const IS_ANDROID = Platform.OS === 'android';

// Frame processor plugins — initialized at module scope so they're
// available in the worklet closure without going through React refs.
const forwardPlugin = VisionCameraProxy.initFrameProcessorPlugin('forwardToWebRTC', {});
const posePlugin = VisionCameraProxy.initFrameProcessorPlugin('detectPose', {});
const clubPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectClub', {});
const frameDiffPlugin = VisionCameraProxy.initFrameProcessorPlugin('frameDiff', {});

/**
 * VisionCamera-based recording view with camera preview and internal
 * WebRTC frame forwarding + optional pose detection.
 *
 * Owns the frame processor that runs both the WebRTC forwarding and
 * pose detection plugins. Pose detection results are stored natively
 * by the plugin and polled from JS by the parent via usePoseDetection —
 * this component receives the polled data as the `poseData` prop for
 * overlay rendering.
 *
 * This architecture bypasses the broken react-native-worklets `runOnJS`
 * serialization (missing `_createSerializableNumber` globals in
 * VisionCamera's frame processor context).
 */
export const VisionCameraRecorder = forwardRef<VisionCameraRecorderRef, VisionCameraRecorderProps>(
  ({
    device, isActive, audio = true, format, fps,
    poseDetectionEnabled = false, poseDetectionFps = 10,
    poseOverlayVisible = false, poseData,
    clubDetectionEnabled = false, clubDetectionFps = 3,
    frameDiffEnabled = false, frameDiffFps = 15,
  }, ref) => {
    const cameraRef = useRef<Camera>(null);

    // Shared values so Reanimated worklets can reactively access dimensions
    const containerWidth = useSharedValue(0);
    const containerHeight = useSharedValue(0);

    // Shared value written from the frame processor worklet (Android only)
    const rotationDegrees = useSharedValue(0);

    const frameProcessor = useFrameProcessor((frame) => {
      'worklet';
      // WebRTC forwarding
      const result = forwardPlugin?.call(frame);
      if (IS_ANDROID && typeof result === 'number') {
        rotationDegrees.value = result;
      }

      // Pose detection — plugin stores result natively, polled from JS thread
      if (poseDetectionEnabled && posePlugin) {
        runAtTargetFps(poseDetectionFps, () => {
          'worklet';
          posePlugin.call(frame);
        });
      }

      // Club detection — runs at lower fps (~3), gated by address state
      if (clubDetectionEnabled && clubPlugin) {
        runAtTargetFps(clubDetectionFps, () => {
          'worklet';
          clubPlugin.call(frame);
        });
      }

      // Frame differencing — runs at ~15fps for motion detection
      if (frameDiffEnabled && frameDiffPlugin) {
        runAtTargetFps(frameDiffFps, () => {
          'worklet';
          frameDiffPlugin.call(frame);
        });
      }
    }, [poseDetectionEnabled, poseDetectionFps, clubDetectionEnabled, clubDetectionFps, frameDiffEnabled, frameDiffFps]);

    // Counter-rotation style for Android preview correction.
    const cameraWrapperStyle = useAnimatedStyle(() => {
      const w = containerWidth.value;
      const h = containerHeight.value;

      if (!IS_ANDROID || w === 0 || h === 0) {
        return {};
      }

      const degrees = rotationDegrees.value;
      if (degrees === 0) {
        return {};
      }

      if (degrees === 90) {
        const scale = h / w;
        return {
          transform: [{ rotate: '-90deg' }, { scale }],
        };
      }
      if (degrees === 180) {
        return {
          transform: [{ rotate: '180deg' }],
        };
      }
      if (degrees === 270) {
        const scale = h / w;
        return {
          transform: [{ rotate: '90deg' }, { scale }],
        };
      }

      return {};
    });

    useImperativeHandle(ref, () => ({
      startRecording: (options) => {
        if (cameraRef.current) {
          cameraRef.current.startRecording({
            onRecordingFinished: options.onRecordingFinished,
            onRecordingError: options.onRecordingError,
            fileType: 'mp4',
            videoCodec: 'h264',
          });
        }
      },
      stopRecording: async () => {
        if (cameraRef.current) {
          await cameraRef.current.stopRecording();
        }
      },
      cancelRecording: async () => {
        if (cameraRef.current) {
          await cameraRef.current.cancelRecording();
        }
      },
      takeSnapshot: async (options) => {
        if (!cameraRef.current) return null;

        try {
          const snapshot = await cameraRef.current.takeSnapshot({
            quality: options?.quality ?? 30,
          });

          const snapshotFile = new File(snapshot.path);
          const base64Data = await snapshotFile.base64();

          try {
            snapshotFile.delete();
          } catch {
            // Ignore cleanup errors
          }

          return base64Data;
        } catch {
          return null;
        }
      },
    }));

    return (
      <View
        style={styles.container}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          containerWidth.value = width;
          containerHeight.value = height;
        }}
      >
        <Animated.View style={[styles.cameraWrapper, IS_ANDROID && cameraWrapperStyle]}>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            device={device}
            isActive={isActive}
            video={true}
            audio={audio}
            format={format}
            fps={fps}
            frameProcessor={frameProcessor}
            androidPreviewViewType="texture-view"
          />
        </Animated.View>
        {poseOverlayVisible && (
          <PoseOverlay
            poseData={poseData ?? null}
            visible={poseOverlayVisible}
          />
        )}
      </View>
    );
  }
);

VisionCameraRecorder.displayName = 'VisionCameraRecorder';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraWrapper: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
});
