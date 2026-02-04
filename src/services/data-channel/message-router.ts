import { clipTransfer } from '@/src/services/clip-sync';

/**
 * Routes incoming data channel messages to the appropriate handler
 * based on the message type field.
 *
 * TRANSFER_* messages go to clipTransfer for clip sync.
 * Preview streaming is now handled natively via WebRTC media tracks.
 */
class MessageRouter {
  /** Routes an incoming data channel message string to the appropriate handler. */
  handleMessage(messageStr: string): void {
    try {
      const parsed = JSON.parse(messageStr);
      const messageType = parsed.type as string;

      if (!messageType) {
        console.warn('Data channel message missing type field');
        return;
      }

      switch (messageType) {
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
