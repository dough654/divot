import { StyleSheet, View, Text, Pressable } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { Ionicons } from '@expo/vector-icons';

export type LocalVideoViewProps = {
  stream: MediaStream | null;
  isFrontCamera: boolean;
  onFlipCamera?: () => void;
  style?: object;
};

/**
 * Displays the local camera preview with a camera flip button.
 */
export const LocalVideoView = ({
  stream,
  isFrontCamera,
  onFlipCamera,
  style,
}: LocalVideoViewProps) => {
  if (!stream) {
    return (
      <View style={[styles.container, styles.placeholder, style]}>
        <Ionicons name="videocam-off" size={48} color="#888" />
        <Text style={styles.placeholderText}>Camera not started</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <RTCView
        streamURL={stream.toURL()}
        style={styles.video}
        objectFit="cover"
        mirror={isFrontCamera}
      />
      {onFlipCamera && (
        <Pressable style={styles.flipButton} onPress={onFlipCamera}>
          <Ionicons name="camera-reverse" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  video: {
    flex: 1,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
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
