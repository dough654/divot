export type P2PSignalingState =
  | 'idle'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export type SignalingMessageType = 'offer' | 'answer' | 'ice-candidate';

/** JSON envelope sent over the Wi-Fi Direct TCP data channel. */
export type SignalingMessage = {
  type: SignalingMessageType;
  /** JSON string of SDP or ICE candidate — opaque to the native layer. */
  payload: string;
};

/** Emitted when a viewer connects and sends a hello to the camera. */
export type P2PInvitation = {
  peerName: string;
};
