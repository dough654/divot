import { StyleSheet, View, Text, Pressable, Image, Alert, Platform } from 'react-native';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { DrawingOverlay } from '@/src/components/annotation/drawing-overlay';
import { StaticAnnotationOverlay } from '@/src/components/annotation/static-annotation-overlay';
import { DrawingToolbar } from '@/src/components/annotation/drawing-toolbar';
import { useDrawing } from '@/src/hooks/use-drawing';
import { captureAnnotatedFrame, saveBase64ImageToGallery } from '@/src/services/annotation/frame-capture';
import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

export type VideoPlayerProps = {
  /** URI of the video to play. */
  uri: string;
  /** Whether to show controls. Defaults to true. */
  showControls?: boolean;
  /** Callback when video ends. */
  onPlaybackEnd?: () => void;
  /** Whether to loop the video. Defaults to false. */
  loop?: boolean;
  /** Clip ID for persisting annotations. Enables drawing when provided. */
  clipId?: string;
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
 * Video player component with play/pause controls, timeline scrubber,
 * and optional annotation drawing (freehand, straight-line, angle).
 */
export const VideoPlayer = ({
  uri,
  showControls = true,
  onPlaybackEnd,
  loop = false,
  clipId,
}: VideoPlayerProps) => {
  const videoRef = useRef<Video>(null);
  const videoContainerRef = useRef<View>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [captureFrameUri, setCaptureFrameUri] = useState<string | null>(null);
  const captureFrameReady = useRef<(() => void) | null>(null);
  const svgLayoutReady = useRef<(() => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staticSvgRef = useRef<any>(null);
  const containerSize = useRef({ width: 0, height: 0 });
  const wasPlayingBeforeSeek = useRef(false);
  const lastSeekTime = useRef(0);
  const pendingSeek = useRef<number | null>(null);

  const { theme } = useTheme();
  const themedStyles = useThemedStyles(createStyles);

  const drawingEnabled = !!clipId;
  const drawing = useDrawing({ clipId: clipId ?? '' });

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
      // Exit draw mode when playing
      if (isDrawMode) {
        setIsDrawMode(false);
      }
      await videoRef.current.playAsync();
    }
  }, [isPlaying, isDrawMode]);

  const toggleDrawMode = useCallback(async () => {
    if (!drawingEnabled) return;

    if (isDrawMode) {
      setIsDrawMode(false);
    } else {
      // Auto-pause when entering draw mode
      if (isPlaying && videoRef.current) {
        await videoRef.current.pauseAsync();
      }
      setIsDrawMode(true);
    }
  }, [isDrawMode, isPlaying, drawingEnabled]);

  // Split into two phases so React actually re-renders between
  // hiding the toolbar and capturing the view.
  const pendingCapture = useRef(false);

  const handleSaveFrame = useCallback(() => {
    if (!videoContainerRef.current) return;

    Alert.alert('Save to Photos', 'Save this annotated frame to your photo gallery?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          // Get the video frame as a thumbnail
          const thumbnail = await VideoThumbnails.getThumbnailAsync(uri, {
            time: position,
          });

          // Read as base64 so Image renders synchronously
          const base64 = await FileSystem.readAsStringAsync(thumbnail.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Phase 1: hide toolbar + show thumbnail, then schedule capture
          pendingCapture.current = true;
          setSaveMessage(null);
          setIsSaving(true);
          setCaptureFrameUri(`data:image/jpeg;base64,${base64}`);
        },
      },
    ]);
  }, [uri, position]);

  // Phase 2: runs after React re-renders with toolbar hidden + thumbnail visible
  useEffect(() => {
    if (!pendingCapture.current || !isSaving || !captureFrameUri) return;
    pendingCapture.current = false;

    const doCapture = async () => {
      try {
        if (Platform.OS === 'android' && drawing.annotations.length > 0) {
          // Android path: captureRef can't see SVG content at all, so we
          // composite frame + annotations entirely within the SVG and export
          // via toDataURL. No captureRef needed.

          // Wait for the SVG (with background image) to layout
          await new Promise<void>((resolve) => {
            if (svgLayoutReady.current === null) {
              svgLayoutReady.current = resolve;
            } else {
              resolve();
            }
          });
          // Extra frames for native SVG + image decoding to finish
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => setTimeout(resolve, 200));

          if (!staticSvgRef.current) {
            throw new Error('SVG ref not available');
          }

          const rawBase64 = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('toDataURL timeout')), 5000);
            staticSvgRef.current.toDataURL((data: string) => {
              clearTimeout(timeout);
              resolve(data);
            });
          });

          await saveBase64ImageToGallery(rawBase64);
        } else {
          // iOS path (or no annotations): use captureRef on the video container
          // which correctly captures both the thumbnail Image and SVG overlay.
          await new Promise<void>((resolve) => {
            if (captureFrameReady.current) {
              captureFrameReady.current = null;
              requestAnimationFrame(() => resolve());
            } else {
              captureFrameReady.current = resolve;
            }
          });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

          await captureAnnotatedFrame(videoContainerRef);
        }

        setSaveMessage('Saved to gallery');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Save failed';
        setSaveMessage(message);
      } finally {
        setCaptureFrameUri(null);
        svgLayoutReady.current = null;
        setIsSaving(false);
        setTimeout(() => setSaveMessage(null), 2000);
      }
    };

    doCapture();
  }, [isSaving, captureFrameUri]);

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

  // Available playback speeds
  const PLAYBACK_SPEEDS = [0.25, 0.5, 1];

  const cyclePlaybackSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newRate = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackRate(newRate);
    videoRef.current?.setRateAsync(newRate, true);
  }, [playbackRate]);

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

  const showAnnotations = drawingEnabled;

  return (
    <View style={themedStyles.container}>
      <Pressable
        ref={videoContainerRef}
        style={themedStyles.videoContainer}
        onPress={isDrawMode ? undefined : togglePlayPause}
        disabled={isDrawMode}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          containerSize.current = { width, height };
        }}
      >
        <Video
          ref={videoRef}
          source={{ uri }}
          style={themedStyles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          shouldPlay={false}
          rate={playbackRate}
        />

        {/* Thumbnail overlay for save capture — native video surfaces
            aren't captured by view-shot, so we overlay a base64 Image
            of the current frame during capture. */}
        {captureFrameUri && (
          <Image
            source={{ uri: captureFrameUri }}
            style={themedStyles.captureFrame}
            resizeMode="contain"
            onLoad={() => {
              captureFrameReady.current?.();
              captureFrameReady.current = null;
            }}
          />
        )}

        {/* Drawing overlay - hidden during save so it doesn't block captureRef */}
        {drawingEnabled && !isSaving && (
          <DrawingOverlay
            drawingEnabled={isDrawMode}
            annotations={showAnnotations ? drawing.annotations : []}
            currentAnnotation={showAnnotations ? drawing.currentAnnotation : null}
            onLineStart={drawing.startLine}
            onLineMove={drawing.addPoint}
            onLineEnd={drawing.endLine}
          />
        )}

        {/* Static annotation layer for capture.
            On iOS: captureRef sees the SVG directly (no background image needed).
            On Android: the frame is embedded as an SVG <Image> element so
            toDataURL produces a fully composited PNG — bypassing captureRef
            which can't see SVG content on Android. */}
        {isSaving && drawing.annotations.length > 0 && (
          <StaticAnnotationOverlay
            ref={staticSvgRef}
            annotations={drawing.annotations}
            width={containerSize.current.width}
            height={containerSize.current.height}
            backgroundImageUri={Platform.OS === 'android' ? captureFrameUri ?? undefined : undefined}
            onReady={() => {
              if (svgLayoutReady.current) {
                svgLayoutReady.current();
              } else {
                svgLayoutReady.current = () => {};
              }
            }}
          />
        )}

        {/* Drawing toolbar - absolutely positioned inside video container */}
        {isDrawMode && !isSaving && (
          <View style={themedStyles.toolbarContainer}>
            <DrawingToolbar
              activeColor={drawing.color}
              presetColors={drawing.presetColors}
              canUndo={drawing.annotations.length > 0 || drawing.anglePhase !== 'idle'}
              canRedo={drawing.canRedo}
              activeTool={drawing.activeTool}
              anglePhase={drawing.anglePhase}
              canSave={drawing.annotations.length > 0}
              onColorSelect={drawing.setColor}
              onUndo={drawing.undo}
              onRedo={drawing.redo}
              onClear={drawing.clearAll}
              onToolSelect={drawing.setActiveTool}
              onSave={handleSaveFrame}
            />
          </View>
        )}

        {/* Save feedback message */}
        {saveMessage && (
          <View style={themedStyles.saveMessageOverlay}>
            <Text style={themedStyles.saveMessageText}>{saveMessage}</Text>
          </View>
        )}

        {/* Loading indicator */}
        {!isLoaded && (
          <View style={themedStyles.loadingOverlay}>
            <Text style={themedStyles.loadingText}>Loading...</Text>
          </View>
        )}
      </Pressable>

      {showControls && isLoaded && (
        <View style={themedStyles.controls}>
          {/* Time display */}
          <View style={themedStyles.timeRow}>
            <Text style={themedStyles.timeText}>{formatTime(position)}</Text>
            <Text style={themedStyles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Timeline scrubber */}
          <Slider
            style={themedStyles.slider}
            minimumValue={0}
            maximumValue={duration}
            value={position}
            onSlidingStart={handleSeekStart}
            onSlidingComplete={handleSeekComplete}
            onValueChange={handleSeekChange}
            minimumTrackTintColor={theme.colors.accent}
            maximumTrackTintColor={theme.colors.textTertiary}
            thumbTintColor={theme.colors.accent}
            accessibilityRole="adjustable"
            accessibilityLabel={`Video position: ${formatTime(position)} of ${formatTime(duration)}`}
            accessibilityHint="Drag to seek through the video"
          />

          {/* Control buttons */}
          <View style={themedStyles.buttonRow}>
            <Pressable
              style={themedStyles.frameButton}
              onPress={stepBackward}
              accessibilityRole="button"
              accessibilityLabel="Previous frame"
              accessibilityHint="Step back one frame"
            >
              <Ionicons name="chevron-back" size={32} color={theme.colors.text} />
            </Pressable>

            <Pressable
              style={themedStyles.playPauseButton}
              onPress={togglePlayPause}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              accessibilityHint={isPlaying ? 'Pause video playback' : 'Start video playback'}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={36}
                color={theme.isDark ? theme.palette.black : theme.palette.white}
              />
            </Pressable>

            <Pressable
              style={themedStyles.frameButton}
              onPress={stepForward}
              accessibilityRole="button"
              accessibilityLabel="Next frame"
              accessibilityHint="Step forward one frame"
            >
              <Ionicons name="chevron-forward" size={32} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* Bottom row: speed + draw toggle */}
          <View style={themedStyles.bottomRow}>
            <Pressable
              style={themedStyles.speedButton}
              onPress={cyclePlaybackSpeed}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${playbackRate}x`}
              accessibilityHint="Cycle through playback speeds"
            >
              <Text style={themedStyles.speedButtonText}>{playbackRate}x</Text>
            </Pressable>

            {drawingEnabled && (
              <Pressable
                style={[
                  themedStyles.drawButton,
                  isDrawMode && themedStyles.drawButtonActive,
                ]}
                onPress={toggleDrawMode}
                accessibilityRole="button"
                accessibilityLabel={isDrawMode ? 'Exit drawing mode' : 'Enter drawing mode'}
                accessibilityHint={isDrawMode ? 'Exit annotation drawing' : 'Draw annotations on the video'}
                accessibilityState={{ selected: isDrawMode }}
              >
                <Ionicons
                  name="pencil"
                  size={18}
                  color={isDrawMode ? theme.colors.text : theme.colors.textTertiary}
                />
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.background,
  },
  video: {
    width: '100%' as const,
    height: '100%' as const,
  },
  captureFrame: {
    ...StyleSheet.absoluteFillObject,
  },
  toolbarContainer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  loadingText: {
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
    fontSize: 9,
    textTransform: 'lowercase' as const,
  },
  controls: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  timeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  timeText: {
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontVariant: ['tabular-nums' as const],
  },
  slider: {
    width: '100%' as const,
    height: 40,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 32,
    marginTop: 8,
  },
  frameButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  bottomRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginTop: 12,
    gap: 12,
  },
  speedButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
  },
  speedButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 9,
    textTransform: 'lowercase' as const,
  },
  drawButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  drawButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  saveMessageOverlay: {
    position: 'absolute' as const,
    bottom: 12,
    alignSelf: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
  },
  saveMessageText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 9,
  },
}));
