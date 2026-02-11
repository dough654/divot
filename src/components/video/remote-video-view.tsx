import { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useVideoZoom } from '@/src/hooks/use-video-zoom';
import type { Theme } from '@/src/context';

export type RemoteVideoViewProps = {
  stream: MediaStream | null;
  isConnecting?: boolean;
  style?: object;
};

/**
 * Displays the remote video stream from a peer with pinch-to-zoom, pan, and
 * a fill/fit toggle button. Zoom is self-contained — no props needed from parent.
 */
export const RemoteVideoView = ({
  stream,
  isConnecting = false,
  style,
}: RemoteVideoViewProps) => {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [containerDimensions, setContainerDimensions] = useState<{
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  const [videoDimensions, setVideoDimensions] = useState<{
    videoWidth: number;
    videoHeight: number;
  } | null>(null);

  const { gesture, animatedStyle, isZoomed, toggleZoom } = useVideoZoom({
    videoDimensions,
    containerDimensions,
  });

  const handleLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerDimensions({ containerWidth: width, containerHeight: height });
  }, []);

  const handleDimensionsChange = useCallback((event: { nativeEvent: { width: number; height: number } }) => {
    const { width, height } = event.nativeEvent;
    setVideoDimensions({ videoWidth: width, videoHeight: height });
  }, []);

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
    <View style={[styles.container, style]} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.video, animatedStyle]}>
          <RTCView
            streamURL={stream.toURL()}
            style={styles.video}
            objectFit="contain"
            onDimensionsChange={handleDimensionsChange}
          />
        </Animated.View>
      </GestureDetector>
      <Pressable
        style={[styles.toggleButton, { bottom: 12 + insets.bottom }]}
        onPress={toggleZoom}
        accessibilityRole="button"
        accessibilityLabel={isZoomed ? 'Fit to screen' : 'Fill screen'}
        accessibilityHint="Toggle between fit and fill video modes"
      >
        <Ionicons
          name={isZoomed ? 'contract-outline' : 'expand-outline'}
          size={20}
          color="#fff"
        />
      </Pressable>
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
