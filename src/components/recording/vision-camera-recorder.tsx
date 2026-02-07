import { StyleSheet, View } from 'react-native';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraDevice, VideoFile, type ReadonlyFrameProcessor } from 'react-native-vision-camera';
import { File } from 'expo-file-system';

export type VisionCameraRecorderProps = {
  /** The camera device to use. */
  device: CameraDevice;
  /** Whether the camera is active. */
  isActive: boolean;
  /** Whether audio recording is enabled. Defaults to true. */
  audio?: boolean;
  /** Optional frame processor for native WebRTC streaming. */
  frameProcessor?: ReadonlyFrameProcessor;
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

/**
 * VisionCamera-based recording view with camera preview.
 * Exposes recording controls via ref.
 *
 * On Android, the SurfaceView doesn't rotate with the UI. We compensate
 * by counter-rotating the Camera view and swapping its dimensions so the
 * preview appears correctly oriented in landscape.
 */
export const VisionCameraRecorder = forwardRef<VisionCameraRecorderRef, VisionCameraRecorderProps>(
  ({ device, isActive, audio = true, frameProcessor }, ref) => {
    const cameraRef = useRef<Camera>(null);

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
      <View style={styles.container}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          device={device}
          isActive={isActive}
          video={true}
          audio={audio}
          frameProcessor={frameProcessor}
        />
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
  camera: {
    flex: 1,
  },
});
