import { clipTransfer } from '@/src/services/clip-sync';
import type { PreviewFrameMessage } from './types';

type PreviewFrameHandler = (message: PreviewFrameMessage) => void;
type PreviewControlHandler = (isStreaming: boolean) => void;

/**
 * Routes incoming data channel messages to the appropriate handler
 * based on the message type field.
 *
 * TRANSFER_* messages go to clipTransfer.
 * PREVIEW_* messages go to registered preview callbacks.
 */
class MessageRouter {
  private previewFrameHandler: PreviewFrameHandler | null = null;
  private previewControlHandler: PreviewControlHandler | null = null;

  /**
   * Registers a handler for incoming preview frames.
   * Returns an unsubscribe function.
   */
  onPreviewFrame(handler: PreviewFrameHandler): () => void {
    this.previewFrameHandler = handler;
    return () => {
      if (this.previewFrameHandler === handler) {
        this.previewFrameHandler = null;
      }
    };
  }

  /**
   * Registers a handler for preview start/stop control messages.
   * Returns an unsubscribe function.
   */
  onPreviewControl(handler: PreviewControlHandler): () => void {
    this.previewControlHandler = handler;
    return () => {
      if (this.previewControlHandler === handler) {
        this.previewControlHandler = null;
      }
    };
  }

  /**
   * Routes an incoming data channel message string to the appropriate handler.
   */
  handleMessage(messageStr: string): void {
    try {
      const parsed = JSON.parse(messageStr);
      const messageType = parsed.type as string;

      if (!messageType) {
        console.warn('Data channel message missing type field');
        return;
      }

      switch (messageType) {
        case 'PREVIEW_FRAME':
          this.previewFrameHandler?.(parsed as PreviewFrameMessage);
          break;

        case 'PREVIEW_START':
          this.previewControlHandler?.(true);
          break;

        case 'PREVIEW_STOP':
          this.previewControlHandler?.(false);
          break;

        case 'TRANSFER_START':
        case 'CHUNK':
        case 'TRANSFER_END':
        case 'TRANSFER_ACK':
        case 'TRANSFER_ERROR':
          clipTransfer.handleMessage(messageStr);
          break;

        default:
          console.warn('Unknown data channel message type:', messageType);
      }
    } catch (err) {
      console.error('Failed to route data channel message:', err);
    }
  }
}

/** Singleton message router instance */
export const messageRouter = new MessageRouter();
