export type MultipeerState =
  | 'idle'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export type SignalingMessageType = 'offer' | 'answer' | 'ice-candidate';

/** JSON envelope sent over the MPC data channel. */
export type SignalingMessage = {
  type: SignalingMessageType;
  /** JSON string of SDP or ICE candidate — opaque to the native layer. */
  payload: string;
};
