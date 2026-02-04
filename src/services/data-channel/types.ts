/** All possible data channel message type strings */
export type DataChannelMessageType =
  | 'TRANSFER_START'
  | 'CHUNK'
  | 'TRANSFER_END'
  | 'TRANSFER_ACK'
  | 'TRANSFER_ERROR';
