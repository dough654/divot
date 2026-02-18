/**
 * BLE payload pack/unpack utilities.
 *
 * Payload format (8 bytes):
 *   [0]   Platform:  0x01 = iOS, 0x02 = Android
 *   [1-6] Room code: 6 ASCII bytes, zero-padded if shorter
 *   [7]   Flags:     upper nibble = protocol version (1), lower = status bits (0)
 */

const PAYLOAD_LENGTH = 8;
const ROOM_CODE_LENGTH = 6;
const PROTOCOL_VERSION = 1;

const PLATFORM_IOS = 0x01;
const PLATFORM_ANDROID = 0x02;

type Platform = 'ios' | 'android';

type PackInput = {
  roomCode: string;
  platform: Platform;
};

type UnpackResult = {
  platform: Platform;
  roomCode: string;
  protocolVersion: number;
  statusBits: number;
};

/** Packs a room code and platform into an 8-byte BLE payload. */
export const packPayload = ({ roomCode, platform }: PackInput): Uint8Array => {
  const buffer = new Uint8Array(PAYLOAD_LENGTH);

  buffer[0] = platform === 'ios' ? PLATFORM_IOS : PLATFORM_ANDROID;

  const truncatedCode = roomCode.slice(0, ROOM_CODE_LENGTH);
  for (let i = 0; i < truncatedCode.length; i++) {
    buffer[1 + i] = truncatedCode.charCodeAt(i);
  }
  // Remaining bytes in [1-6] stay 0x00 (zero-padded)

  buffer[7] = (PROTOCOL_VERSION << 4) | 0x00;

  return buffer;
};

/** Unpacks an 8-byte BLE payload into its fields. Returns null if data is invalid. */
export const unpackPayload = (data: Uint8Array): UnpackResult | null => {
  if (data.length < PAYLOAD_LENGTH) {
    return null;
  }

  const platformByte = data[0];
  let platform: Platform;
  if (platformByte === PLATFORM_IOS) {
    platform = 'ios';
  } else if (platformByte === PLATFORM_ANDROID) {
    platform = 'android';
  } else {
    return null;
  }

  // Extract room code, stripping trailing zero bytes
  let roomCode = '';
  for (let i = 1; i <= ROOM_CODE_LENGTH; i++) {
    if (data[i] === 0x00) break;
    roomCode += String.fromCharCode(data[i]);
  }

  if (roomCode.length === 0) {
    return null;
  }

  const flags = data[7];
  const protocolVersion = (flags >> 4) & 0x0f;
  const statusBits = flags & 0x0f;

  return { platform, roomCode, protocolVersion, statusBits };
};
