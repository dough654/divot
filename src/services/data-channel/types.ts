/** Preview frame sent from camera to viewer */
export type PreviewFrameMessage = {
  type: 'PREVIEW_FRAME';
  data: string; // Base64-encoded JPEG
  timestamp: number;
};

/** Control messages for preview streaming */
export type PreviewStartMessage = {
  type: 'PREVIEW_START';
};

export type PreviewStopMessage = {
  type: 'PREVIEW_STOP';
};

export type PreviewControlMessage = PreviewStartMessage | PreviewStopMessage;

/** Union of all preview-related messages */
export type PreviewMessage = PreviewFrameMessage | PreviewControlMessage;

/** All possible data channel message type strings */
export type DataChannelMessageType =
  | 'PREVIEW_FRAME'
  | 'PREVIEW_START'
  | 'PREVIEW_STOP'
  | 'TRANSFER_START'
  | 'CHUNK'
  | 'TRANSFER_END'
  | 'TRANSFER_ACK'
  | 'TRANSFER_ERROR';
