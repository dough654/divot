import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { Ionicons } from '@expo/vector-icons';

export type RemoteVideoViewProps = {
  stream: MediaStream | null;
  isConnecting?: boolean;
  style?: object;
};

/**
 * Displays the remote video stream from a peer.
 */
export const RemoteVideoView = ({
  stream,
  isConnecting = false,
  style,
}: RemoteVideoViewProps) => {
  if (isConnecting) {
    return (
      <View style={[styles.container, styles.placeholder, style]}>
        <ActivityIndicator size="large" color="#E5A020" />
        <Text style={styles.placeholderText}>Connecting...</Text>
      </View>
    );
  }

  if (!stream) {
    return (
      <View style={[styles.container, styles.placeholder, style]}>
        <Ionicons name="videocam-off" size={48} color="#888" />
        <Text style={styles.placeholderText}>Waiting for video stream</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <RTCView
        streamURL={stream.toURL()}
        style={styles.video}
        objectFit="contain"
      />
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
    fontSize: 16,
  },
});
