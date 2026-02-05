import { StyleSheet, View, Pressable, Platform } from 'react-native';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraDevice, VideoFile, type ReadonlyFrameProcessor } from 'react-native-vision-camera';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';

export type VisionCameraRecorderProps = {
  /** The camera device to use. */
  device: CameraDevice;
  /** Whether the camera is active. */
  isActive: boolean;
  /** Whether to use the front camera (for mirroring). */
  isFrontCamera: boolean;
  /** Whether audio recording is enabled. Defaults to true. */
  audio?: boolean;
  /** Callback when camera flip is requested. */
  onFlipCamera?: () => void;
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
  ({ device, isActive, audio = true, onFlipCamera, frameProcessor }, ref) => {
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
          androidPreviewViewType={Platform.OS === 'android' ? 'texture-view' : undefined}
          device={device}
          isActive={isActive}
          video={true}
          audio={audio}
          frameProcessor={frameProcessor}
        />
        {onFlipCamera && (
          <Pressable
            style={styles.flipButton}
            onPress={onFlipCamera}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
            accessibilityHint="Switch between front and back camera"
          >
            <Ionicons name="camera-reverse" size={28} color="#fff" />
          </Pressable>
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
  camera: {
    flex: 1,
  },
  flipButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
