import { StyleSheet, View, Pressable } from 'react-native';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraDevice, VideoFile } from 'react-native-vision-camera';
import { Ionicons } from '@expo/vector-icons';

export type VisionCameraRecorderProps = {
  /** The camera device to use. */
  device: CameraDevice;
  /** Whether the camera is active. */
  isActive: boolean;
  /** Whether to use the front camera (for mirroring). */
  isFrontCamera: boolean;
  /** Callback when camera flip is requested. */
  onFlipCamera?: () => void;
};

export type VisionCameraRecorderRef = {
  /** Start recording video. */
  startRecording: (options: {
    onRecordingFinished: (video: VideoFile) => void;
    onRecordingError: (error: unknown) => void;
  }) => void;
  /** Stop recording video. */
  stopRecording: () => Promise<void>;
};

/**
 * VisionCamera-based recording view with camera preview.
 * Exposes recording controls via ref.
 */
export const VisionCameraRecorder = forwardRef<VisionCameraRecorderRef, VisionCameraRecorderProps>(
  ({ device, isActive, onFlipCamera }, ref) => {
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
    }));

    return (
      <View style={styles.container}>
        <Camera
          ref={cameraRef}
          style={styles.camera}
          device={device}
          isActive={isActive}
          video={true}
          audio={true}
        />
        {onFlipCamera && (
          <Pressable style={styles.flipButton} onPress={onFlipCamera}>
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
