import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useRef, useState, useCallback } from 'react';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

export type VideoPlayerProps = {
  /** URI of the video to play. */
  uri: string;
  /** Whether to show controls. Defaults to true. */
  showControls?: boolean;
  /** Callback when video ends. */
  onPlaybackEnd?: () => void;
  /** Whether to loop the video. Defaults to false. */
  loop?: boolean;
};

/**
 * Formats milliseconds to MM:SS format.
 */
const formatTime = (millis: number): string => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Video player component with play/pause controls and timeline scrubber.
 */
export const VideoPlayer = ({
  uri,
  showControls = true,
  onPlaybackEnd,
  loop = false,
}: VideoPlayerProps) => {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const handlePlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsLoaded(false);
        return;
      }

      setIsLoaded(true);
      setIsPlaying(status.isPlaying);
      setDuration(status.durationMillis || 0);

      if (!isSeeking) {
        setPosition(status.positionMillis || 0);
      }

      if (status.didJustFinish && !loop) {
        onPlaybackEnd?.();
      }
    },
    [isSeeking, loop, onPlaybackEnd]
  );

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying]);

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
  }, []);

  const handleSeekComplete = useCallback(async (value: number) => {
    if (!videoRef.current) return;

    await videoRef.current.setPositionAsync(value);
    setPosition(value);
    setIsSeeking(false);
  }, []);

  const handleSeekChange = useCallback((value: number) => {
    setPosition(value);
  }, []);

  const skipBackward = useCallback(async () => {
    if (!videoRef.current) return;
    const newPosition = Math.max(0, position - 5000);
    await videoRef.current.setPositionAsync(newPosition);
  }, [position]);

  const skipForward = useCallback(async () => {
    if (!videoRef.current) return;
    const newPosition = Math.min(duration, position + 5000);
    await videoRef.current.setPositionAsync(newPosition);
  }, [position, duration]);

  return (
    <View style={styles.container}>
      <Pressable style={styles.videoContainer} onPress={togglePlayPause}>
        <Video
          ref={videoRef}
          source={{ uri }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          shouldPlay={false}
        />

        {/* Play/Pause overlay when paused */}
        {isLoaded && !isPlaying && (
          <View style={styles.playOverlay}>
            <View style={styles.playButton}>
              <Ionicons name="play" size={48} color="#fff" />
            </View>
          </View>
        )}

        {/* Loading indicator */}
        {!isLoaded && (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
      </Pressable>

      {showControls && isLoaded && (
        <View style={styles.controls}>
          {/* Time display */}
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Timeline scrubber */}
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={position}
            onSlidingStart={handleSeekStart}
            onSlidingComplete={handleSeekComplete}
            onValueChange={handleSeekChange}
            minimumTrackTintColor="#4CAF50"
            maximumTrackTintColor="#666"
            thumbTintColor="#4CAF50"
          />

          {/* Control buttons */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.controlButton} onPress={skipBackward}>
              <Ionicons name="play-back" size={28} color="#fff" />
              <Text style={styles.skipLabel}>5s</Text>
            </Pressable>

            <Pressable style={styles.playPauseButton} onPress={togglePlayPause}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color="#fff"
              />
            </Pressable>

            <Pressable style={styles.controlButton} onPress={skipForward}>
              <Ionicons name="play-forward" size={28} color="#fff" />
              <Text style={styles.skipLabel}>5s</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 6, // Offset play icon to center visually
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  controls: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  slider: {
    width: '100%',
    height: 40,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 8,
  },
  controlButton: {
    alignItems: 'center',
    padding: 8,
  },
  skipLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
