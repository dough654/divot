import type { Clip } from '@/src/types/recording';

/** Chunk size for data channel transfers (64KB works on most implementations) */
export const CHUNK_SIZE = 64 * 1024;

/** Transfer message types */
export type TransferMessageType =
  | 'TRANSFER_START'
  | 'CHUNK'
  | 'TRANSFER_END'
  | 'TRANSFER_ACK'
  | 'TRANSFER_ERROR';

/** Metadata sent at start of transfer */
export type TransferMetadata = {
  clipId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  duration: number;
  fps: number;
  name?: string;
};

/** Transfer start message */
export type TransferStartMessage = {
  type: 'TRANSFER_START';
  metadata: TransferMetadata;
};

/** Chunk data message */
export type ChunkMessage = {
  type: 'CHUNK';
  clipId: string;
  chunkIndex: number;
  data: string; // Base64 encoded binary data
};

/** Transfer end message */
export type TransferEndMessage = {
  type: 'TRANSFER_END';
  clipId: string;
  checksum: string;
};

/** Acknowledgment message */
export type TransferAckMessage = {
  type: 'TRANSFER_ACK';
  clipId: string;
  success: boolean;
  error?: string;
};

/** Error message */
export type TransferErrorMessage = {
  type: 'TRANSFER_ERROR';
  clipId: string;
  error: string;
};

/** Union of all transfer messages */
export type TransferMessage =
  | TransferStartMessage
  | ChunkMessage
  | TransferEndMessage
  | TransferAckMessage
  | TransferErrorMessage;

/** Transfer state */
export type TransferState = 'idle' | 'sending' | 'receiving' | 'complete' | 'error';

/** Transfer progress info */
export type TransferProgress = {
  state: TransferState;
  clipId: string | null;
  clipName: string | null;
  totalChunks: number;
  completedChunks: number;
  progress: number; // 0-100
  error: string | null;
};

/** Initial transfer progress state */
export const initialTransferProgress: TransferProgress = {
  state: 'idle',
  clipId: null,
  clipName: null,
  totalChunks: 0,
  completedChunks: 0,
  progress: 0,
  error: null,
};
