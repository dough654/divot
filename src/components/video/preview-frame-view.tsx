import { StyleSheet, View, Text, Image, ActivityIndicator } from 'react-native';

export type PreviewFrameViewProps = {
  /** Latest base64 JPEG frame data */
  latestFrame: string | null;
  /** Whether the peer connection is established */
  isConnected: boolean;
  /** Optional style override */
  style?: object;
};

/**
 * Renders incoming base64 JPEG preview frames as a React Native Image.
 * Shows placeholder states when connecting or waiting for frames.
 */
export const PreviewFrameView = ({
  latestFrame,
  isConnected,
  style,
}: PreviewFrameViewProps) => {
  if (!isConnected) {
    return (
      <View style={[styles.container, styles.placeholder, style]}>
        <ActivityIndicator size="large" color="#888" />
        <Text style={styles.placeholderText}>Connecting...</Text>
      </View>
    );
  }

  if (!latestFrame) {
    return (
      <View style={[styles.container, styles.placeholder, style]}>
        <ActivityIndicator size="small" color="#888" />
        <Text style={styles.placeholderText}>Waiting for camera...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri: `data:image/jpeg;base64,${latestFrame}` }}
        style={styles.frame}
        resizeMode="contain"
      />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderText: {
    color: '#888',
    fontSize: 16,
  },
  frame: {
    flex: 1,
  },
});
