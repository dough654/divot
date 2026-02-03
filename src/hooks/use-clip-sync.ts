import { useState, useEffect, useCallback } from 'react';
import { DataChannel } from '@/src/services/webrtc';
import { clipTransfer, TransferProgress, initialTransferProgress } from '@/src/services/clip-sync';
import { messageRouter } from '@/src/services/data-channel';
import type { Clip } from '@/src/types/recording';

export type UseClipSyncOptions = {
  dataChannel: DataChannel | null;
  onClipReceived?: (clip: Clip) => void;
};

export type UseClipSyncResult = {
  isReady: boolean;
  progress: TransferProgress;
  sendClip: (clip: Clip) => Promise<void>;
  cancelTransfer: () => void;
};

/**
 * Hook for syncing clips over WebRTC data channel.
 */
export const useClipSync = ({
  dataChannel,
  onClipReceived,
}: UseClipSyncOptions): UseClipSyncResult => {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState<TransferProgress>(initialTransferProgress);

  // Set up data channel for clip transfer
  useEffect(() => {
    if (!dataChannel) {
      setIsReady(false);
      clipTransfer.setDataChannel(null);
      return;
    }

    // Set up transfer callbacks
    clipTransfer.setCallbacks({
      onProgress: setProgress,
      onComplete: (clip) => {
        onClipReceived?.(clip);
      },
      onError: (error) => {
        console.error('Clip transfer error:', error);
        setProgress((prev) => ({
          ...prev,
          state: 'error',
          error,
        }));
      },
    });

    // Route all data channel messages through the message router
    dataChannel.onmessage = (event) => {
      messageRouter.handleMessage(event.data);
    };

    // Check if channel is ready
    if (dataChannel.readyState === 'open') {
      setIsReady(true);
      clipTransfer.setDataChannel(dataChannel);
    }

    return () => {
      clipTransfer.reset();
      setIsReady(false);
    };
  }, [dataChannel, onClipReceived]);

  const sendClip = useCallback(async (clip: Clip): Promise<void> => {
    if (!isReady) {
      throw new Error('Data channel not ready');
    }
    await clipTransfer.sendClip(clip);
  }, [isReady]);

  const cancelTransfer = useCallback(() => {
    clipTransfer.reset();
    setProgress(initialTransferProgress);
  }, []);

  return {
    isReady,
    progress,
    sendClip,
    cancelTransfer,
  };
};
