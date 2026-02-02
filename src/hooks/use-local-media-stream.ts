import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaStream } from 'react-native-webrtc';
import { getLocalMediaStream, stopMediaStream } from '@/src/services/webrtc';

export type UseLocalMediaStreamOptions = {
  video?: boolean;
  audio?: boolean;
  useFrontCamera?: boolean;
  autoStart?: boolean;
};

export type UseLocalMediaStreamResult = {
  stream: MediaStream | null;
  isLoading: boolean;
  error: string | null;
  isFrontCamera: boolean;
  startStream: () => Promise<void>;
  stopStream: () => void;
  toggleCamera: () => Promise<void>;
};

/**
 * Hook for managing local media stream (camera and microphone).
 * Handles stream lifecycle, camera switching, and error states.
 */
export const useLocalMediaStream = (
  options: UseLocalMediaStreamOptions = {}
): UseLocalMediaStreamResult => {
  const {
    video = true,
    audio = true,
    useFrontCamera: initialFrontCamera = false,
    autoStart = false,
  } = options;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState(initialFrontCamera);
  const streamRef = useRef<MediaStream | null>(null);

  const startStream = useCallback(async () => {
    if (streamRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const mediaStream = await getLocalMediaStream({
        video,
        audio,
        useFrontCamera: isFrontCamera,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMessage);
      console.error('Failed to get media stream:', err);
    } finally {
      setIsLoading(false);
    }
  }, [video, audio, isFrontCamera]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
    const wasStreaming = streamRef.current !== null;

    if (wasStreaming) {
      stopStream();
    }

    setIsFrontCamera((prev) => !prev);

    // Restart with new camera if was streaming
    if (wasStreaming) {
      setIsLoading(true);
      try {
        const mediaStream = await getLocalMediaStream({
          video,
          audio,
          useFrontCamera: !isFrontCamera,
        });

        streamRef.current = mediaStream;
        setStream(mediaStream);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to switch camera';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  }, [video, audio, isFrontCamera, stopStream]);

  // Auto-start stream if requested
  useEffect(() => {
    if (autoStart) {
      startStream();
    }
  }, [autoStart, startStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
      }
    };
  }, []);

  return {
    stream,
    isLoading,
    error,
    isFrontCamera,
    startStream,
    stopStream,
    toggleCamera,
  };
};
