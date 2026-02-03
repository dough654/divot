import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useRef, useState, useCallback, useEffect } from 'react';
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
  const wasPlayingBeforeSeek = useRef(false);
  const lastSeekTime = useRef(0);
  const pendingSeek = useRef<number | null>(null);

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

  const handleSeekStart = useCallback(async () => {
    setIsSeeking(true);
    wasPlayingBeforeSeek.current = isPlaying;
    // Pause during scrubbing for frame-accurate seeking
    if (videoRef.current && isPlaying) {
      await videoRef.current.pauseAsync();
    }
  }, [isPlaying]);

  // Safely seek, ignoring "interrupted" errors from rapid scrubbing
  const safeSeek = useCallback(async (value: number) => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.setPositionAsync(value, {
        toleranceMillisBefore: 0,
        toleranceMillisAfter: 0,
      });
    } catch (err) {
      // Ignore "Seeking interrupted" errors - expected during rapid scrubbing
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('interrupted')) {
        console.error('Seek error:', err);
      }
    }
  }, []);

  const handleSeekComplete = useCallback(async (value: number) => {
    if (!videoRef.current) return;

    await safeSeek(value);
    setPosition(value);
    setIsSeeking(false);

    // Resume playing if was playing before
    if (wasPlayingBeforeSeek.current) {
      await videoRef.current.playAsync();
    }
  }, [safeSeek]);

  // Throttled seek while dragging - seeks every 50ms for smooth scrubbing
  const handleSeekChange = useCallback(async (value: number) => {
    setPosition(value);

    const now = Date.now();
    if (now - lastSeekTime.current < 50) {
      // Too soon, store for later
      pendingSeek.current = value;
      return;
    }

    lastSeekTime.current = now;
    pendingSeek.current = null;

    await safeSeek(value);
  }, [safeSeek]);

  // Process any pending seek when throttle window passes
  useEffect(() => {
    if (!isSeeking || pendingSeek.current === null) return;

    const timer = setTimeout(async () => {
      if (pendingSeek.current !== null) {
        await safeSeek(pendingSeek.current);
        pendingSeek.current = null;
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [position, isSeeking, safeSeek]);

  // Frame step duration in ms (assuming 30fps = ~33ms per frame)
  const FRAME_DURATION_MS = 33;

  const stepBackward = useCallback(async () => {
    if (!videoRef.current) return;
    const newPosition = Math.max(0, position - FRAME_DURATION_MS);
    await safeSeek(newPosition);
    setPosition(newPosition);
  }, [position, safeSeek]);

  const stepForward = useCallback(async () => {
    if (!videoRef.current) return;
    const newPosition = Math.min(duration, position + FRAME_DURATION_MS);
    await safeSeek(newPosition);
    setPosition(newPosition);
  }, [position, duration, safeSeek]);

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
            <Pressable style={styles.frameButton} onPress={stepBackward}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>

            <Pressable style={styles.playPauseButton} onPress={togglePlayPause}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color="#fff"
              />
            </Pressable>

            <Pressable style={styles.frameButton} onPress={stepForward}>
              <Ionicons name="chevron-forward" size={32} color="#fff" />
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
    backgroundColor: '#1a1a2e',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#12121f',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 46, 0.8)',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  controls: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
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
  frameButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
