import type { QRCodePayload, ConnectionMode } from '@/src/types';

const QR_PAYLOAD_VERSION = 1;
const QR_PAYLOAD_PREFIX = 'SWINGLINK:';

/**
 * Simple base64 encoding for React Native compatibility.
 */
const encodeBase64 = (str: string): string => {
  // Use built-in btoa which is available in React Native
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    // Fallback for environments where btoa is not available
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let i = 0; i < str.length; i += 3) {
      const chr1 = str.charCodeAt(i);
      const chr2 = str.charCodeAt(i + 1);
      const chr3 = str.charCodeAt(i + 2);
      const enc1 = chr1 >> 2;
      const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      const enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
      const enc4 = isNaN(chr3) ? 64 : chr3 & 63;
      output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
    }
    return output;
  }
};

/**
 * Simple base64 decoding for React Native compatibility.
 */
const decodeBase64 = (str: string): string => {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    // Fallback for environments where atob is not available
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let i = 0;
    const input = str.replace(/[^A-Za-z0-9+/=]/g, '');
    while (i < input.length) {
      const enc1 = chars.indexOf(input.charAt(i++));
      const enc2 = chars.indexOf(input.charAt(i++));
      const enc3 = chars.indexOf(input.charAt(i++));
      const enc4 = chars.indexOf(input.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    return output;
  }
};

/**
 * Encodes a QR code payload into a string for display.
 * Format: SWINGLINK:<base64-encoded-json>
 */
export const encodeQRPayload = (payload: QRCodePayload): string => {
  const data = {
    v: QR_PAYLOAD_VERSION,
    ...payload,
  };

  const jsonString = JSON.stringify(data);
  const base64 = encodeBase64(jsonString);

  return `${QR_PAYLOAD_PREFIX}${base64}`;
};

/**
 * Decodes a QR code string back into a payload object.
 * Returns null if the string is not a valid SwingLink QR code.
 */
export const decodeQRPayload = (qrString: string): QRCodePayload | null => {
  if (!qrString.startsWith(QR_PAYLOAD_PREFIX)) {
    return null;
  }

  try {
    const base64 = qrString.slice(QR_PAYLOAD_PREFIX.length);
    const jsonString = decodeBase64(base64);
    const data = JSON.parse(jsonString);

    // Validate required fields
    if (!data.sessionId || typeof data.sessionId !== 'string') {
      return null;
    }

    // Validate mode
    const validModes: ConnectionMode[] = ['auto', 'hotspot'];
    if (data.mode && !validModes.includes(data.mode)) {
      return null;
    }

    return {
      sessionId: data.sessionId,
      mode: data.mode || 'auto',
      hotspotSsid: data.hotspotSsid,
      hotspotPassword: data.hotspotPassword,
      localIp: data.localIp,
      signalingUrl: data.signalingUrl,
    };
  } catch {
    return null;
  }
};

/**
 * Creates a QR payload for camera mode with automatic connection.
 */
export const createAutoModePayload = (params: {
  sessionId: string;
  localIp?: string;
  signalingUrl?: string;
}): QRCodePayload => ({
  sessionId: params.sessionId,
  mode: 'auto',
  localIp: params.localIp,
  signalingUrl: params.signalingUrl,
});

/**
 * Creates a QR payload for hotspot mode with WiFi credentials.
 */
export const createHotspotModePayload = (params: {
  sessionId: string;
  hotspotSsid: string;
  hotspotPassword: string;
  signalingUrl?: string;
}): QRCodePayload => ({
  sessionId: params.sessionId,
  mode: 'hotspot',
  hotspotSsid: params.hotspotSsid,
  hotspotPassword: params.hotspotPassword,
  signalingUrl: params.signalingUrl,
});

/**
 * Validates if a string is a valid SwingLink QR code.
 */
export const isValidSwingLinkQR = (qrString: string): boolean => {
  return decodeQRPayload(qrString) !== null;
};
