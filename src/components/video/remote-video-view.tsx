import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

export type RemoteVideoViewProps = {
  stream: MediaStream | null;
  isConnecting?: boolean;
  style?: object;
  /** Video scaling mode. 'contain' shows full frame (pillarboxed), 'cover' fills viewport (cropped). */
  objectFit?: 'contain' | 'cover';
  /** Called when the user taps the fill/fit toggle. */
  onToggleObjectFit?: () => void;
};

/**
 * Displays the remote video stream from a peer with an optional fill/fit toggle.
 */
export const RemoteVideoView = ({
  stream,
  isConnecting = false,
  style,
  objectFit = 'contain',
  onToggleObjectFit,
}: RemoteVideoViewProps) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

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
        objectFit={objectFit}
      />
      {onToggleObjectFit && (
        <Pressable
          style={[styles.toggleButton, { bottom: 12 + insets.bottom }]}
          onPress={onToggleObjectFit}
          accessibilityRole="button"
          accessibilityLabel={objectFit === 'contain' ? 'Fill screen' : 'Fit to screen'}
          accessibilityHint="Toggle between fit and fill video modes"
        >
          <Ionicons
            name={objectFit === 'contain' ? 'expand-outline' : 'contract-outline'}
            size={20}
            color="#fff"
          />
        </Pressable>
      )}
    </View>
  );
};

const createStyles = makeThemedStyles((_theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden' as const,
  },
  video: {
    flex: 1,
  },
  placeholder: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  placeholderText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  toggleButton: {
    position: 'absolute' as const,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
}));
