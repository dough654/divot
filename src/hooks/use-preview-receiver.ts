import { useState, useEffect, useRef } from 'react';
import { messageRouter } from '@/src/services/data-channel';
import type { DataChannel } from '@/src/services/webrtc';

/** How long to wait without frames before considering the stream stopped (ms) */
const RECEIVING_TIMEOUT_MS = 3000;

export type UsePreviewReceiverOptions = {
  /** WebRTC data channel to receive frames on */
  dataChannel: DataChannel | null;
};

export type UsePreviewReceiverResult = {
  /** The latest base64 JPEG frame data, or null if none received */
  latestFrame: string | null;
  /** Whether frames are actively being received */
  isReceiving: boolean;
};

/**
 * Receives preview frames from the camera device via the data channel
 * message router. Updates latestFrame state on each incoming PREVIEW_FRAME.
 */
export const usePreviewReceiver = ({
  dataChannel,
}: UsePreviewReceiverOptions): UsePreviewReceiverResult => {
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [isReceiving, setIsReceiving] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register with the message router for preview frames
  useEffect(() => {
    if (!dataChannel) {
      setLatestFrame(null);
      setIsReceiving(false);
      return;
    }

    const resetTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setIsReceiving(false);
      }, RECEIVING_TIMEOUT_MS);
    };

    const unsubscribeFrame = messageRouter.onPreviewFrame((message) => {
      setLatestFrame(message.data);
      setIsReceiving(true);
      resetTimeout();
    });

    const unsubscribeControl = messageRouter.onPreviewControl((streaming) => {
      if (!streaming) {
        setIsReceiving(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    });

    return () => {
      unsubscribeFrame();
      unsubscribeControl();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [dataChannel]);

  return {
    latestFrame,
    isReceiving,
  };
};
