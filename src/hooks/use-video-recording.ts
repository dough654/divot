import { useState, useCallback, useRef, useEffect } from 'react';
import { Camera, VideoFile } from 'react-native-vision-camera';
import type { RecordingState, RecordingOptions, Clip } from '@/src/types/recording';
import { saveClip } from '@/src/services/recording/clip-storage';

export type UseVideoRecordingOptions = {
  /** Recording configuration options. */
  recordingOptions?: RecordingOptions;
  /** Callback when recording completes successfully. */
  onRecordingComplete?: (clip: Clip) => void;
  /** Callback when recording fails. */
  onRecordingError?: (error: Error) => void;
};

export type UseVideoRecordingResult = {
  /** Current recording state. */
  recordingState: RecordingState;
  /** Whether currently recording. */
  isRecording: boolean;
  /** Duration of current recording in seconds. */
  recordingDuration: number;
  /** Error message if recording failed. */
  error: string | null;
  /** Start recording. Requires a camera ref. */
  startRecording: (cameraRef: React.RefObject<Camera | null>) => Promise<void>;
  /** Stop recording and save the clip. */
  stopRecording: () => Promise<Clip | null>;
};

/**
 * Hook for managing video recording state and operations.
 * Works with VisionCamera to capture video clips.
 */
export const useVideoRecording = (
  options: UseVideoRecordingOptions = {}
): UseVideoRecordingResult => {
  const { recordingOptions = {}, onRecordingComplete, onRecordingError } = options;

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cameraRefInternal = useRef<Camera | null>(null);
  const recordingStartTime = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingVideoRef = useRef<VideoFile | null>(null);

  // Duration timer
  useEffect(() => {
    if (recordingState === 'recording') {
      recordingStartTime.current = Date.now();
      setRecordingDuration(0);

      durationIntervalRef.current = setInterval(() => {
        if (recordingStartTime.current) {
          const elapsed = (Date.now() - recordingStartTime.current) / 1000;
          setRecordingDuration(Math.floor(elapsed));
        }
      }, 100);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [recordingState]);

  const startRecording = useCallback(
    async (cameraRef: React.RefObject<Camera | null>): Promise<void> => {
      if (recordingState === 'recording') {
        console.warn('Already recording');
        return;
      }

      if (!cameraRef.current) {
        const errorMsg = 'Camera not ready';
        setError(errorMsg);
        onRecordingError?.(new Error(errorMsg));
        return;
      }

      cameraRefInternal.current = cameraRef.current;
      setError(null);
      setRecordingState('recording');

      try {
        cameraRef.current.startRecording({
          onRecordingFinished: (video: VideoFile) => {
            pendingVideoRef.current = video;
          },
          onRecordingError: (recordError: unknown) => {
            const err = recordError instanceof Error ? recordError : new Error(String(recordError));
            setError(err.message);
            setRecordingState('idle');
            onRecordingError?.(err);
          },
          fileType: 'mp4',
          videoCodec: recordingOptions.videoCodec || 'h264',
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to start recording';
        setError(errorMsg);
        setRecordingState('idle');
        onRecordingError?.(err instanceof Error ? err : new Error(errorMsg));
      }
    },
    [recordingState, recordingOptions, onRecordingError]
  );

  const stopRecording = useCallback(async (): Promise<Clip | null> => {
    if (recordingState !== 'recording') {
      console.warn('Not currently recording');
      return null;
    }

    if (!cameraRefInternal.current) {
      setError('Camera reference lost');
      setRecordingState('idle');
      return null;
    }

    const duration = recordingDuration;

    try {
      // Stop the recording - this triggers onRecordingFinished
      await cameraRefInternal.current.stopRecording();

      // Wait a bit for the callback to fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      const video = pendingVideoRef.current;
      pendingVideoRef.current = null;

      if (!video) {
        throw new Error('No video file received from camera');
      }

      // Save the clip
      const clip = await saveClip({
        path: video.path,
        duration,
        fps: recordingOptions.targetFps || 30,
      });

      setRecordingState('idle');
      onRecordingComplete?.(clip);
      return clip;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(errorMsg);
      setRecordingState('idle');
      onRecordingError?.(err instanceof Error ? err : new Error(errorMsg));
      return null;
    }
  }, [recordingState, recordingDuration, recordingOptions, onRecordingComplete, onRecordingError]);

  return {
    recordingState,
    isRecording: recordingState === 'recording',
    recordingDuration,
    error,
    startRecording,
    stopRecording,
  };
};
