import { StyleSheet, View, Text, Pressable, Image, Platform } from 'react-native';
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Video, ResizeMode, AVPlaybackStatus, VideoReadyForDisplayEvent } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { DrawingOverlay } from '@/src/components/annotation/drawing-overlay';
import { StaticAnnotationOverlay } from '@/src/components/annotation/static-annotation-overlay';
import { DrawingToolbar } from '@/src/components/annotation/drawing-toolbar';
import { ShaftOverlay } from '@/src/components/playback/shaft-overlay';
import { useDrawing } from '@/src/hooks/use-drawing';
import { useSwingAnalysis } from '@/src/hooks/use-swing-analysis';
import { findNearestShaftFrame } from '@/src/utils/shaft-frame-lookup';
import {
  captureAnnotatedFrame,
  captureFrameToTempFile,
  saveBase64ImageToGallery,
  shareBase64Image,
  shareTempFile,
} from '@/src/services/annotation/frame-capture';
import { computeContainRect } from '@/src/utils/contain-rect';
import { useProAccess } from '@/src/hooks/use-pro-access';
import { useVideoExport } from '@/src/hooks/use-video-export';
import { ExportProgressModal } from '@/src/components/export';
import { FormatPickerModal } from '@/src/components/playback/format-picker-modal';
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
  /** File path to the clip (needed for swing analysis). Falls back to uri. */
  clipPath?: string;
  /** Whether the device is currently in landscape orientation. */
  isLandscape?: boolean;
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

const CONTROLS_AUTO_HIDE_MS = 3000;

/**
 * Video player component with play/pause controls, timeline scrubber,
 * and optional annotation drawing (freehand, straight-line, angle).
 *
 * In landscape mode, controls become a semi-transparent overlay that
 * auto-hides after 3 seconds of inactivity. Tap the video to toggle.
 */
export const VideoPlayer = ({
  uri,
  showControls = true,
  onPlaybackEnd,
  loop = false,
  clipId,
  clipPath,
  isLandscape = false,
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

  // Landscape overlay controls visibility
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { theme } = useTheme();
  const themedStyles = useThemedStyles(createStyles);
  const { isPro } = useProAccess();

  const drawingEnabled = !!clipId;
  const drawing = useDrawing({ clipId: clipId ?? '' });

  // Video export
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportSvgRef = useRef<any>(null);
  const exportSvgReady = useRef<(() => void) | null>(null);
  const [videoNaturalWidth, setVideoNaturalWidth] = useState(0);
  const [videoNaturalHeight, setVideoNaturalHeight] = useState(0);
  const pendingExportAction = useRef<'save' | 'share' | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [formatPickerMode, setFormatPickerMode] = useState<'save' | 'share' | null>(null);

  // Swing analysis
  const analysisEnabled = !!clipId;
  const analysis = useSwingAnalysis({
    clipId: clipId ?? '',
    clipPath: clipPath ?? uri,
  });
  const [showShaftOverlay, setShowShaftOverlay] = useState(false);
  const [showTracePath, setShowTracePath] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Video content rect within container (for export letterbox correction)
  const exportContentRect = useMemo(() => {
    if (videoNaturalWidth <= 0 || videoNaturalHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
      return undefined;
    }
    return computeContainRect(videoNaturalWidth, videoNaturalHeight, containerWidth, containerHeight);
  }, [videoNaturalWidth, videoNaturalHeight, containerWidth, containerHeight]);

  const videoExport = useVideoExport({
    videoPath: clipPath ?? uri,
    durationMs: duration,
    contentRect: exportContentRect,
    videoWidth: videoNaturalWidth || undefined,
    videoHeight: videoNaturalHeight || undefined,
  });

  // Look up the current shaft frame based on playback position
  const currentShaft = useMemo(() => {
    if (!showShaftOverlay || !analysis.result) return null;
    return findNearestShaftFrame(analysis.result.frames, position);
  }, [showShaftOverlay, analysis.result, position]);

  // Frames up to the current position (for trace path)
  const traceFrames = useMemo(() => {
    if (!showTracePath || !analysis.result) return [];
    return analysis.result.frames.filter((f) => f.timestampMs <= position);
  }, [showTracePath, analysis.result, position]);

  const handleAnalyzePress = useCallback(() => {
    if (analysis.status === 'analyzing') {
      analysis.cancel();
    } else if (analysis.result) {
      // Toggle overlay visibility
      setShowShaftOverlay((prev) => !prev);
    } else {
      analysis.analyze();
    }
  }, [analysis]);

  const handleAnalyzeLongPress = useCallback(() => {
    if (analysis.result && showShaftOverlay) {
      setShowTracePath((prev) => !prev);
    }
  }, [analysis.result, showShaftOverlay]);

  // Auto-show overlay when analysis completes
  useEffect(() => {
    if (analysis.status === 'complete' && analysis.result) {
      setShowShaftOverlay(true);
    }
  }, [analysis.status]);

  const needsOverlay = drawing.annotations.length > 0 || !isPro;

  const startVideoExport = useCallback(async () => {
    setExportModalVisible(true);
    setIsExporting(true);
    setCompletionMessage(null);

    const getOverlayBase64 = needsOverlay
      ? async () => {
          // Mount the hidden SVG overlay at video container size and get base64 PNG
          await new Promise<void>((resolve) => {
            if (exportSvgReady.current === null) {
              exportSvgReady.current = resolve;
            } else {
              resolve();
            }
          });
          // Wait for native SVG rendering
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => setTimeout(resolve, 200));

          if (!exportSvgRef.current) {
            throw new Error('SVG ref not available for export');
          }

          // Force 1x output so pixel dimensions match the CSS-point contentRect
          // used by the FFmpeg crop filter. Without this, toDataURL produces a
          // high-DPI image (2x/3x) and the crop coordinates miss the annotations.
          const overlayWidth = Math.round(containerSize.current.width);
          const overlayHeight = Math.round(containerSize.current.height);

          const base64 = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('toDataURL timeout')), 5000);
            exportSvgRef.current.toDataURL((data: string) => {
              clearTimeout(timeout);
              resolve(data);
            }, overlayWidth, overlayHeight);
          });

          setIsExporting(false);
          return base64;
        }
      : undefined;

    await videoExport.startExport(getOverlayBase64);
  }, [videoExport, needsOverlay]);

  // Auto-save or auto-share when export completes
  useEffect(() => {
    if (videoExport.status !== 'complete' || !pendingExportAction.current) return;

    const action = pendingExportAction.current;
    pendingExportAction.current = null;

    const performAction = async () => {
      try {
        if (action === 'save') {
          await videoExport.saveToGallery();
          setCompletionMessage('saved to gallery');
        } else {
          await videoExport.share();
          setCompletionMessage('shared');
        }
      } catch {
        setCompletionMessage('failed');
      }
    };

    performAction();
  }, [videoExport.status]);

  const handleExportDone = useCallback(() => {
    videoExport.reset();
    setExportModalVisible(false);
    setIsExporting(false);
    setCompletionMessage(null);
    pendingExportAction.current = null;
    exportSvgReady.current = null;
  }, [videoExport]);

  const handleExportRetry = useCallback(() => {
    startVideoExport();
  }, [startVideoExport]);

  // Auto-hide controls in landscape when playing
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (isLandscape && isPlaying && !isDrawMode) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_AUTO_HIDE_MS);
    }
  }, [isLandscape, isPlaying, isDrawMode]);

  // Reset timer when play state or landscape changes
  useEffect(() => {
    if (isLandscape && isPlaying && !isDrawMode) {
      resetHideTimer();
    } else {
      // Always show controls when paused or portrait
      setControlsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isLandscape, isPlaying, isDrawMode, resetHideTimer]);

  // Show controls when orientation changes
  useEffect(() => {
    setControlsVisible(true);
  }, [isLandscape]);

  const handleVideoTap = useCallback(() => {
    if (isDrawMode) return;

    if (isLandscape) {
      setControlsVisible((prev) => !prev);
      if (!controlsVisible) {
        resetHideTimer();
      }
    } else {
      togglePlayPause();
    }
  }, [isLandscape, isDrawMode, controlsVisible, resetHideTimer]);

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

  const handleReadyForDisplay = useCallback((event: VideoReadyForDisplayEvent) => {
    setVideoNaturalWidth(event.naturalSize.width);
    setVideoNaturalHeight(event.naturalSize.height);
  }, []);

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
  const pendingCapture = useRef<'save' | 'share' | null>(null);

  /**
   * Phase 1: prepare a thumbnail overlay for the current frame,
   * then schedule a capture. The `action` determines what happens after capture.
   */
  const beginFrameCapture = useCallback(async (action: 'save' | 'share') => {
    if (!videoContainerRef.current) return;

    const thumbnail = await VideoThumbnails.getThumbnailAsync(uri, {
      time: position,
    });
    const base64 = await FileSystem.readAsStringAsync(thumbnail.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    pendingCapture.current = action;
    setSaveMessage(null);
    setIsSaving(true);
    setCaptureFrameUri(`data:image/jpeg;base64,${base64}`);
  }, [uri, position]);

  // Phase 2: runs after React re-renders with toolbar hidden + thumbnail visible
  useEffect(() => {
    if (!pendingCapture.current || !isSaving || !captureFrameUri) return;
    const action = pendingCapture.current;
    pendingCapture.current = null;

    const doCapture = async () => {
      try {
        if (Platform.OS === 'android' && drawing.annotations.length > 0) {
          // Android path: captureRef can't see SVG content at all, so we
          // composite frame + annotations entirely within the SVG and export
          // via toDataURL. No captureRef needed.

          await new Promise<void>((resolve) => {
            if (svgLayoutReady.current === null) {
              svgLayoutReady.current = resolve;
            } else {
              resolve();
            }
          });
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

          if (action === 'save') {
            await saveBase64ImageToGallery(rawBase64);
          } else {
            await shareBase64Image(rawBase64);
          }
        } else {
          // iOS path (or no annotations): use captureRef on the video container
          await new Promise<void>((resolve) => {
            if (captureFrameReady.current) {
              captureFrameReady.current = null;
              requestAnimationFrame(() => resolve());
            } else {
              captureFrameReady.current = resolve;
            }
          });
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

          if (action === 'save') {
            await captureAnnotatedFrame(videoContainerRef);
          } else {
            const tempPath = await captureFrameToTempFile(videoContainerRef);
            await shareTempFile(tempPath);
          }
        }

        setSaveMessage(action === 'save' ? 'saved to gallery' : 'shared');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed';
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

  // Save/Share action sheet handlers
  const saveScreenshot = useCallback(() => beginFrameCapture('save'), [beginFrameCapture]);
  const shareScreenshot = useCallback(() => beginFrameCapture('share'), [beginFrameCapture]);

  const saveVideoClip = useCallback(() => {
    pendingExportAction.current = 'save';
    startVideoExport();
  }, [startVideoExport]);

  const shareVideoClip = useCallback(() => {
    pendingExportAction.current = 'share';
    startVideoExport();
  }, [startVideoExport]);

  const handleSave = useCallback(() => {
    setFormatPickerMode('save');
  }, []);

  const handleShare = useCallback(() => {
    setFormatPickerMode('share');
  }, []);

  const handleFormatSelect = useCallback((format: 'screenshot' | 'video-clip') => {
    const mode = formatPickerMode;
    setFormatPickerMode(null);

    if (format === 'screenshot') {
      if (mode === 'save') saveScreenshot();
      else shareScreenshot();
    } else {
      if (mode === 'save') saveVideoClip();
      else shareVideoClip();
    }
  }, [formatPickerMode, saveScreenshot, shareScreenshot, saveVideoClip, shareVideoClip]);

  const handleFormatCancel = useCallback(() => {
    setFormatPickerMode(null);
  }, []);

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
  const showControlsSection = showControls && isLoaded;
  const controlsOverlay = isLandscape && showControlsSection;

  return (
    <View style={themedStyles.container}>
      <Pressable
        ref={videoContainerRef}
        style={[themedStyles.videoContainer, isLandscape && themedStyles.videoContainerLandscape]}
        onPress={handleVideoTap}
        disabled={isDrawMode}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          containerSize.current = { width, height };
          setContainerWidth(width);
          setContainerHeight(height);
        }}
      >
        <Video
          ref={videoRef}
          source={{ uri }}
          style={themedStyles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={loop}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onReadyForDisplay={handleReadyForDisplay}
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

        {/* Shaft detection overlay */}
        {showShaftOverlay && !isSaving && containerWidth > 0 && analysis.result && (
          <ShaftOverlay
            currentShaft={currentShaft}
            allShaftResults={traceFrames}
            showTracePath={showTracePath}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            videoWidth={analysis.result.analysisResolution.width}
            videoHeight={analysis.result.analysisResolution.height}
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

        {/* Hidden SVG overlay for video export — generates the PNG overlay via toDataURL.
            Mounted when annotations exist OR when a watermark is needed (free users). */}
        {isExporting && (drawing.annotations.length > 0 || !isPro) && (
          <StaticAnnotationOverlay
            ref={exportSvgRef}
            annotations={drawing.annotations}
            width={containerSize.current.width}
            height={containerSize.current.height}
            watermarkText={!isPro ? 'recorded with divot' : undefined}
            onReady={() => {
              if (exportSvgReady.current) {
                exportSvgReady.current();
              } else {
                exportSvgReady.current = () => {};
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
              onColorSelect={drawing.setColor}
              onUndo={drawing.undo}
              onRedo={drawing.redo}
              onClear={drawing.clearAll}
              onToolSelect={drawing.setActiveTool}
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

        {/* Analysis progress overlay */}
        {analysis.status === 'analyzing' && (
          <View style={themedStyles.analysisOverlay}>
            <Text style={themedStyles.analysisText}>
              analyzing... {Math.round(analysis.progress * 100)}%
            </Text>
            <Pressable
              style={themedStyles.analysisCancelButton}
              onPress={analysis.cancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel analysis"
            >
              <Text style={themedStyles.analysisCancelText}>cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Landscape overlay controls */}
        {controlsOverlay && controlsVisible && (
          <View style={themedStyles.controlsOverlay}>
            {/* Time + slider */}
            <View style={themedStyles.timeRow}>
              <Text style={[themedStyles.timeText, themedStyles.timeTextOverlay]}>{formatTime(position)}</Text>
              <Slider
                style={themedStyles.sliderLandscape}
                minimumValue={0}
                maximumValue={duration}
                value={position}
                onSlidingStart={handleSeekStart}
                onSlidingComplete={handleSeekComplete}
                onValueChange={handleSeekChange}
                minimumTrackTintColor={theme.colors.accent}
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor={theme.colors.accent}
                accessibilityRole="adjustable"
                accessibilityLabel={`Video position: ${formatTime(position)} of ${formatTime(duration)}`}
              />
              <Text style={[themedStyles.timeText, themedStyles.timeTextOverlay]}>{formatTime(duration)}</Text>
            </View>

            {/* Compact button row */}
            <View style={themedStyles.buttonRowLandscape}>
              <Pressable style={themedStyles.frameButton} onPress={stepBackward} accessibilityRole="button" accessibilityLabel="Previous frame">
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Pressable style={themedStyles.playPauseButtonLandscape} onPress={togglePlayPause} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#000" />
              </Pressable>
              <Pressable style={themedStyles.frameButton} onPress={stepForward} accessibilityRole="button" accessibilityLabel="Next frame">
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </Pressable>
              <Pressable style={themedStyles.speedButtonLandscape} onPress={cyclePlaybackSpeed} accessibilityRole="button" accessibilityLabel={`Playback speed ${playbackRate}x`}>
                <Text style={themedStyles.speedButtonText}>{playbackRate}x</Text>
              </Pressable>
              {drawingEnabled && (
                <Pressable
                  style={[themedStyles.drawButton, isDrawMode && themedStyles.drawButtonActive]}
                  onPress={toggleDrawMode}
                  accessibilityRole="button"
                  accessibilityLabel={isDrawMode ? 'Exit drawing mode' : 'Enter drawing mode'}
                  accessibilityState={{ selected: isDrawMode }}
                >
                  <Ionicons name="pencil" size={18} color={isDrawMode ? theme.colors.text : '#fff'} />
                </Pressable>
              )}
              {analysisEnabled && (
                <Pressable
                  style={[themedStyles.drawButton, showShaftOverlay && themedStyles.drawButtonActive]}
                  onPress={handleAnalyzePress}
                  onLongPress={handleAnalyzeLongPress}
                  accessibilityRole="button"
                  accessibilityLabel={analysis.result ? 'Toggle shaft overlay' : 'Analyze swing'}
                >
                  <Ionicons
                    name="analytics-outline"
                    size={18}
                    color={showShaftOverlay ? theme.colors.text : '#fff'}
                  />
                </Pressable>
              )}
              <Pressable
                style={themedStyles.drawButton}
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Save"
              >
                <Ionicons name="download-outline" size={18} color="#fff" />
              </Pressable>
              <Pressable
                style={themedStyles.drawButton}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share"
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>

      {/* Portrait controls (standard layout below video) */}
      {showControlsSection && !isLandscape && (
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
            {analysisEnabled && (
              <Pressable
                style={[
                  themedStyles.drawButton,
                  showShaftOverlay && themedStyles.drawButtonActive,
                ]}
                onPress={handleAnalyzePress}
                onLongPress={handleAnalyzeLongPress}
                accessibilityRole="button"
                accessibilityLabel={analysis.result ? 'Toggle shaft overlay' : 'Analyze swing'}
                accessibilityHint={analysis.result ? 'Show or hide the club shaft tracking' : 'Analyze the swing to detect club shaft positions'}
              >
                <Ionicons
                  name="analytics-outline"
                  size={18}
                  color={showShaftOverlay ? theme.colors.text : theme.colors.textTertiary}
                />
              </Pressable>
            )}
            <Pressable
              style={themedStyles.drawButton}
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel="Save"
              accessibilityHint="Save a screenshot or video clip to gallery"
            >
              <Ionicons
                name="download-outline"
                size={18}
                color={theme.colors.textTertiary}
              />
            </Pressable>
            <Pressable
              style={themedStyles.drawButton}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share"
              accessibilityHint="Share a screenshot or video clip"
            >
              <Ionicons
                name="share-outline"
                size={18}
                color={theme.colors.textTertiary}
              />
            </Pressable>
          </View>
        </View>
      )}

      <FormatPickerModal
        visible={formatPickerMode !== null}
        title={formatPickerMode === 'save' ? 'save to gallery' : 'share'}
        onSelectScreenshot={() => handleFormatSelect('screenshot')}
        onSelectVideoClip={() => handleFormatSelect('video-clip')}
        onCancel={handleFormatCancel}
      />

      <ExportProgressModal
        visible={exportModalVisible}
        status={videoExport.status}
        progress={videoExport.progress}
        errorMessage={videoExport.errorMessage}
        completionMessage={completionMessage}
        onCancel={videoExport.cancel}
        onDone={handleExportDone}
        onRetry={handleExportRetry}
      />
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
  videoContainerLandscape: {
    backgroundColor: '#000',
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
    fontSize: 15,
    textTransform: 'lowercase' as const,
  },
  controls: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  controlsOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  timeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 4,
  },
  timeText: {
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontVariant: ['tabular-nums' as const],
  },
  timeTextOverlay: {
    color: '#fff',
    fontSize: 13,
  },
  slider: {
    width: '100%' as const,
    height: 40,
  },
  sliderLandscape: {
    flex: 1,
    height: 32,
    marginHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 32,
    marginTop: 8,
  },
  buttonRowLandscape: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 16,
    marginTop: 4,
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
  playPauseButtonLandscape: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  speedButtonLandscape: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: theme.borderRadius.sm,
  },
  speedButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 15,
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
    fontSize: 15,
  },
  analysisOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  analysisText: {
    fontFamily: theme.fontFamily.mono,
    color: '#fff',
    fontSize: 15,
    textTransform: 'lowercase' as const,
    fontVariant: ['tabular-nums' as const],
  },
  analysisCancelButton: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: theme.borderRadius.sm,
  },
  analysisCancelText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: '#fff',
    fontSize: 13,
    textTransform: 'lowercase' as const,
  },
}));
