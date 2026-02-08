/**
 * User-friendly error messages with recovery suggestions.
 * Maps technical error codes/types to actionable guidance.
 */

export type ErrorInfo = {
  title: string;
  message: string;
  recoveryActions: readonly RecoveryAction[];
};

export type RecoveryAction = {
  label: string;
  action: 'retry' | 'rescan' | 'settings' | 'dismiss' | 'hotspot' | 'wifi';
  primary?: boolean;
};

/**
 * Connection-related error messages.
 */
export const connectionErrors = {
  signalingFailed: {
    title: 'Server Unavailable',
    message: 'Could not reach the connection server. Check your internet connection and try again.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  roomNotFound: {
    title: 'Room Not Found',
    message: 'The room code may have expired or the camera device disconnected. Ask the camera to show a new QR code.',
    recoveryActions: [
      { label: 'Scan Again', action: 'rescan' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  roomFull: {
    title: 'Room Full',
    message: 'Another viewer is already connected. Only one viewer can connect at a time.',
    recoveryActions: [
      { label: 'Scan New Code', action: 'rescan' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  webrtcFailed: {
    title: 'Connection Failed',
    message: 'Could not establish a direct connection. Both devices may be on restrictive networks.',
    recoveryActions: [
      { label: 'Try Hotspot', action: 'hotspot' as const, primary: true },
      { label: 'Try Again', action: 'retry' as const },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  iceConnectionFailed: {
    title: 'Connection Dropped',
    message: 'The direct connection was interrupted. This can happen if one device changes networks.',
    recoveryActions: [
      { label: 'Reconnect', action: 'retry' as const, primary: true },
      { label: 'Rescan QR', action: 'rescan' as const },
    ],
  },

  networkUnreachable: {
    title: 'Network Issue',
    message: 'Devices cannot reach each other. Try connecting both devices to the same WiFi network, or use hotspot mode.',
    recoveryActions: [
      { label: 'Use Hotspot', action: 'hotspot' as const, primary: true },
      { label: 'Check WiFi', action: 'wifi' as const },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  reconnectFailed: {
    title: 'Reconnection Failed',
    message: 'Could not restore the connection after multiple attempts. The camera may have moved to a different network.',
    recoveryActions: [
      { label: 'Scan New Code', action: 'rescan' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  timeout: {
    title: 'Connection Timeout',
    message: 'The connection took too long to establish. Check that both devices have a strong signal.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  connectionDeclined: {
    title: 'Connection Declined',
    message: 'The camera declined the connection request.',
    recoveryActions: [
      { label: 'Scan Again', action: 'rescan' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  connectionRequestTimeout: {
    title: 'Request Timed Out',
    message: 'The camera did not respond in time.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  noInternet: {
    title: 'Internet Required',
    message: 'An internet connection is required to reach the connection server.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },
} as const;

/**
 * Permission-related error messages.
 */
export const permissionErrors = {
  cameraPermissionDenied: {
    title: 'Camera Access Required',
    message: 'SwingLink needs camera access to record swings and stream video. Grant permission in Settings.',
    recoveryActions: [
      { label: 'Open Settings', action: 'settings' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  microphonePermissionDenied: {
    title: 'Microphone Access Recommended',
    message: 'Without microphone access, recordings will have no audio. You can still record video-only.',
    recoveryActions: [
      { label: 'Open Settings', action: 'settings' as const, primary: true },
      { label: 'Continue Without Audio', action: 'dismiss' as const },
    ],
  },
} as const;

/**
 * Recording-related error messages.
 */
export const recordingErrors = {
  recordingFailed: {
    title: 'Recording Failed',
    message: 'Could not start recording. The camera may be in use by another app.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  saveFailed: {
    title: 'Save Failed',
    message: 'Could not save the recording to storage. Check available storage space.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  noCamera: {
    title: 'No Camera Found',
    message: 'Could not find a camera device. Try restarting the app.',
    recoveryActions: [
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },
} as const;

/**
 * Sync/transfer-related error messages.
 */
export const syncErrors = {
  transferFailed: {
    title: 'Transfer Failed',
    message: 'Could not send the clip to the viewer. Check that both devices are still connected.',
    recoveryActions: [
      { label: 'Try Again', action: 'retry' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  transferCancelled: {
    title: 'Transfer Cancelled',
    message: 'The clip transfer was cancelled.',
    recoveryActions: [
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },

  noConnection: {
    title: 'No Viewer Connected',
    message: 'Connect to a viewer device first to sync clips.',
    recoveryActions: [
      { label: 'Show QR Code', action: 'rescan' as const, primary: true },
      { label: 'Dismiss', action: 'dismiss' as const },
    ],
  },
} as const;

/**
 * Maps ICE connection state to an error info if failed.
 */
export const getIceConnectionError = (state: RTCIceConnectionState): ErrorInfo | null => {
  switch (state) {
    case 'failed':
      return connectionErrors.iceConnectionFailed;
    case 'disconnected':
      return connectionErrors.iceConnectionFailed;
    default:
      return null;
  }
};

/**
 * Maps signaling error codes to user-friendly error info.
 */
export const getSignalingError = (code: string): ErrorInfo => {
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return connectionErrors.roomNotFound;
    case 'ROOM_FULL':
      return connectionErrors.roomFull;
    case 'CONNECTION_FAILED':
      return connectionErrors.signalingFailed;
    case 'TIMEOUT':
      return connectionErrors.timeout;
    case 'CONNECTION_DECLINED':
      return connectionErrors.connectionDeclined;
    case 'REQUEST_TIMEOUT':
      return connectionErrors.connectionRequestTimeout;
    case 'NO_INTERNET':
      return connectionErrors.noInternet;
    default:
      return connectionErrors.signalingFailed;
  }
};

/**
 * Generic error fallback for unknown errors.
 */
export const genericError: ErrorInfo = {
  title: 'Something Went Wrong',
  message: 'An unexpected error occurred. Please try again.',
  recoveryActions: [
    { label: 'Try Again', action: 'retry', primary: true },
    { label: 'Dismiss', action: 'dismiss' },
  ],
};
