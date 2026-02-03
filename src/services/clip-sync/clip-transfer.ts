import { File, Paths } from 'expo-file-system';
import type { Clip } from '@/src/types/recording';

/**
 * Converts a path to a file URI if needed.
 */
const toFileUri = (path: string): string => {
  if (path.startsWith('file://')) {
    return path;
  }
  return `file://${path}`;
};

/**
 * Decodes a base64 string to Uint8Array.
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};
import {
  CHUNK_SIZE,
  TransferMessage,
  TransferMetadata,
  TransferProgress,
  initialTransferProgress,
} from './types';
import { saveClip } from '@/src/services/recording/clip-storage';

type DataChannel = {
  send: (data: string) => void;
  readyState: string;
};

type TransferCallbacks = {
  onProgress: (progress: TransferProgress) => void;
  onComplete: (clip: Clip) => void;
  onError: (error: string) => void;
};

/**
 * Manages clip transfer over WebRTC data channel.
 */
export class ClipTransfer {
  private dataChannel: DataChannel | null = null;
  private callbacks: TransferCallbacks | null = null;

  // Sending state
  private sendingClipId: string | null = null;

  // Receiving state
  private receivingMetadata: TransferMetadata | null = null;
  private receivedChunks: Map<number, string> = new Map();

  /**
   * Sets the data channel for transfers.
   */
  setDataChannel(channel: DataChannel | null): void {
    this.dataChannel = channel;
  }

  /**
   * Sets callbacks for transfer events.
   */
  setCallbacks(callbacks: TransferCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Simple hash function for checksum (not cryptographic, just for integrity check).
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Sends a clip to the connected peer.
   */
  async sendClip(clip: Clip): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    this.sendingClipId = clip.id;

    try {
      // Read the file
      const fileUri = toFileUri(clip.path);
      const file = new File(fileUri);
      if (!file.exists) {
        throw new Error('Clip file not found');
      }

      const base64Content = await file.base64();
      const totalSize = base64Content.length;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

      // Calculate simple checksum
      const checksum = this.simpleHash(base64Content);

      // Send transfer start
      const metadata: TransferMetadata = {
        clipId: clip.id,
        filename: `${clip.id}.mp4`,
        totalSize,
        totalChunks,
        duration: clip.duration,
        fps: clip.fps,
        name: clip.name,
      };

      this.sendMessage({ type: 'TRANSFER_START', metadata });

      this.callbacks?.onProgress({
        state: 'sending',
        clipId: clip.id,
        clipName: clip.name || null,
        totalChunks,
        completedChunks: 0,
        progress: 0,
        error: null,
      });

      // Send chunks with small delay to avoid overwhelming the channel
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkData = base64Content.slice(start, end);

        this.sendMessage({
          type: 'CHUNK',
          clipId: clip.id,
          chunkIndex: i,
          data: chunkData,
        });

        this.callbacks?.onProgress({
          state: 'sending',
          clipId: clip.id,
          clipName: clip.name || null,
          totalChunks,
          completedChunks: i + 1,
          progress: Math.round(((i + 1) / totalChunks) * 100),
          error: null,
        });

        // Small delay between chunks to prevent buffer overflow
        if (i < totalChunks - 1 && i % 10 === 0) {
          await this.delay(1);
        }
      }

      // Send transfer end
      this.sendMessage({
        type: 'TRANSFER_END',
        clipId: clip.id,
        checksum,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.callbacks?.onError(errorMessage);
      this.sendingClipId = null;
      throw err;
    }
  }

  /**
   * Handles an incoming message from the data channel.
   */
  async handleMessage(messageStr: string): Promise<void> {
    try {
      const message: TransferMessage = JSON.parse(messageStr);

      switch (message.type) {
        case 'TRANSFER_START':
          await this.handleTransferStart(message.metadata);
          break;

        case 'CHUNK':
          this.handleChunk(message.clipId, message.chunkIndex, message.data);
          break;

        case 'TRANSFER_END':
          await this.handleTransferEnd(message.clipId, message.checksum);
          break;

        case 'TRANSFER_ACK':
          this.handleAck(message.clipId, message.success, message.error);
          break;

        case 'TRANSFER_ERROR':
          this.handleTransferError(message.clipId, message.error);
          break;
      }
    } catch (err) {
      console.error('Failed to handle transfer message:', err);
    }
  }

  private async handleTransferStart(metadata: TransferMetadata): Promise<void> {
    this.receivingMetadata = metadata;
    this.receivedChunks.clear();

    this.callbacks?.onProgress({
      state: 'receiving',
      clipId: metadata.clipId,
      clipName: metadata.name || null,
      totalChunks: metadata.totalChunks,
      completedChunks: 0,
      progress: 0,
      error: null,
    });
  }

  private handleChunk(clipId: string, chunkIndex: number, data: string): void {
    if (!this.receivingMetadata || this.receivingMetadata.clipId !== clipId) {
      return;
    }

    this.receivedChunks.set(chunkIndex, data);

    const completedChunks = this.receivedChunks.size;
    const totalChunks = this.receivingMetadata.totalChunks;

    this.callbacks?.onProgress({
      state: 'receiving',
      clipId,
      clipName: this.receivingMetadata.name || null,
      totalChunks,
      completedChunks,
      progress: Math.round((completedChunks / totalChunks) * 100),
      error: null,
    });
  }

  private async handleTransferEnd(clipId: string, expectedChecksum: string): Promise<void> {
    if (!this.receivingMetadata || this.receivingMetadata.clipId !== clipId) {
      this.sendMessage({
        type: 'TRANSFER_ERROR',
        clipId,
        error: 'No active transfer for this clip',
      });
      return;
    }

    try {
      // Reassemble chunks
      const chunks: string[] = [];
      for (let i = 0; i < this.receivingMetadata.totalChunks; i++) {
        const chunk = this.receivedChunks.get(i);
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`);
        }
        chunks.push(chunk);
      }
      const base64Content = chunks.join('');

      // Verify checksum
      const actualChecksum = this.simpleHash(base64Content);

      if (actualChecksum !== expectedChecksum) {
        throw new Error('Checksum mismatch - transfer corrupted');
      }

      // Save the clip
      const clip = await this.saveReceivedClip(base64Content);

      // Send acknowledgment
      this.sendMessage({
        type: 'TRANSFER_ACK',
        clipId,
        success: true,
      });

      this.callbacks?.onProgress({
        state: 'complete',
        clipId,
        clipName: this.receivingMetadata.name || null,
        totalChunks: this.receivingMetadata.totalChunks,
        completedChunks: this.receivingMetadata.totalChunks,
        progress: 100,
        error: null,
      });

      this.callbacks?.onComplete(clip);

      // Reset receiving state
      this.receivingMetadata = null;
      this.receivedChunks.clear();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      this.sendMessage({
        type: 'TRANSFER_ACK',
        clipId,
        success: false,
        error: errorMessage,
      });

      this.callbacks?.onError(errorMessage);

      // Reset receiving state
      this.receivingMetadata = null;
      this.receivedChunks.clear();
    }
  }

  private async saveReceivedClip(base64Content: string): Promise<Clip> {
    if (!this.receivingMetadata) {
      throw new Error('No receiving metadata');
    }

    // Create a temporary file in the document directory
    const tempFilename = `temp_${Date.now()}.mp4`;
    const tempFile = new File(Paths.document, tempFilename);

    // Decode base64 to binary and write
    const binaryData = base64ToUint8Array(base64Content);
    tempFile.write(binaryData);

    // Save using clip storage (which will copy to proper location)
    const clip = await saveClip({
      path: tempFile.uri,
      duration: this.receivingMetadata.duration,
      fps: this.receivingMetadata.fps,
      name: this.receivingMetadata.name,
    });

    // Clean up temp file
    try {
      tempFile.delete();
    } catch {
      // Ignore cleanup errors
    }

    return clip;
  }

  private handleAck(clipId: string, success: boolean, error?: string): void {
    if (this.sendingClipId !== clipId) {
      return;
    }

    if (success) {
      this.callbacks?.onProgress({
        state: 'complete',
        clipId,
        clipName: null,
        totalChunks: 0,
        completedChunks: 0,
        progress: 100,
        error: null,
      });
    } else {
      this.callbacks?.onError(error || 'Transfer failed');
    }

    this.sendingClipId = null;
  }

  private handleTransferError(clipId: string, error: string): void {
    this.callbacks?.onError(error);

    if (this.sendingClipId === clipId) {
      this.sendingClipId = null;
    }

    if (this.receivingMetadata?.clipId === clipId) {
      this.receivingMetadata = null;
      this.receivedChunks.clear();
    }
  }

  private sendMessage(message: TransferMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }
    this.dataChannel.send(JSON.stringify(message));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Resets all transfer state.
   */
  reset(): void {
    this.sendingClipId = null;
    this.receivingMetadata = null;
    this.receivedChunks.clear();
    this.callbacks?.onProgress(initialTransferProgress);
  }
}

/** Singleton instance */
export const clipTransfer = new ClipTransfer();
