import { StyleSheet, View, Platform } from 'react-native';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraDevice, VideoFile, VisionCameraProxy, useFrameProcessor } from 'react-native-vision-camera';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { File } from 'expo-file-system';

export type VisionCameraRecorderProps = {
  /** The camera device to use. */
  device: CameraDevice;
  /** Whether the camera is active. */
  isActive: boolean;
  /** Whether audio recording is enabled. Defaults to true. */
  audio?: boolean;
};

export type VisionCameraRecorderRef = {
  /** Start recording video. */
  startRecording: (options: {
    onRecordingFinished: (video: VideoFile) => void;
    onRecordingError: (error: unknown) => void;
  }) => void;
  /** Stop recording video. */
  stopRecording: () => Promise<void>;
  /** Capture a snapshot from the preview buffer and return it as a base64 JPEG string. */
  takeSnapshot: (options?: { quality?: number }) => Promise<string | null>;
};

const IS_ANDROID = Platform.OS === 'android';

/**
 * VisionCamera-based recording view with camera preview and internal
 * WebRTC frame forwarding.
 *
 * Owns the frame processor plugin (`forwardToWebRTC`) and reads back
 * the device rotation degrees. On Android, counter-rotates the Camera
 * view so the preview appears correctly oriented regardless of how the
 * device is held (the UI is portrait-locked on the camera screen).
 */
export const VisionCameraRecorder = forwardRef<VisionCameraRecorderRef, VisionCameraRecorderProps>(
  ({ device, isActive, audio = true }, ref) => {
    const cameraRef = useRef<Camera>(null);

    // Shared values so Reanimated worklets can reactively access dimensions
    const containerWidth = useSharedValue(0);
    const containerHeight = useSharedValue(0);

    // Shared value written from the frame processor worklet (Android only)
    const rotationDegrees = useSharedValue(0);

    // Frame processor plugin: forwards frames to WebRTC and returns rotation degrees
    const forwardPlugin = VisionCameraProxy.initFrameProcessorPlugin('forwardToWebRTC', {});

    const frameProcessor = useFrameProcessor((frame) => {
      'worklet';
      const result = forwardPlugin?.call(frame);
      if (IS_ANDROID && typeof result === 'number') {
        rotationDegrees.value = result;
      }
    }, [forwardPlugin]);

    // Counter-rotation style for Android preview correction.
    // Applied to an Animated.View wrapper around Camera (avoids type issues
    // with createAnimatedComponent on Camera's native SurfaceView).
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
      takeSnapshot: async (options) => {
        if (!cameraRef.current) return null;

        try {
          const snapshot = await cameraRef.current.takeSnapshot({
            quality: options?.quality ?? 30,
          });

          const snapshotFile = new File(snapshot.path);
          const base64Data = await snapshotFile.base64();

          // Clean up temp file
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
            frameProcessor={frameProcessor}
            androidPreviewViewType="texture-view"
          />
        </Animated.View>
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
