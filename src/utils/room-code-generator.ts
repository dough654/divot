/**
 * Characters used for room code generation.
 * Excludes ambiguous characters (0, O, 1, I, l) for easier reading.
 */
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_CODE_LENGTH = 6;

/**
 * Generates a random room code for pairing devices.
 * Uses uppercase letters and numbers, excluding ambiguous characters.
 */
export const generateRoomCode = (length = DEFAULT_CODE_LENGTH): string => {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[randomIndex];
  }
  return code;
};

/**
 * Generates a unique session ID for WebRTC connections.
 * Combines a room code with a timestamp for uniqueness.
 */
export const generateSessionId = (): string => {
  const code = generateRoomCode(8);
  const timestamp = Date.now().toString(36);
  return `${code}-${timestamp}`;
};

/**
 * Validates if a string is a valid room code format.
 */
export const isValidRoomCode = (code: string): boolean => {
  if (typeof code !== 'string' || code.length !== DEFAULT_CODE_LENGTH) {
    return false;
  }

  return code.split('').every((char) => ROOM_CODE_CHARS.includes(char));
};

/**
 * Formats a room code for display (adds spacing for readability).
 */
export const formatRoomCode = (code: string): string => {
  if (code.length <= 3) {
    return code;
  }

  const midpoint = Math.ceil(code.length / 2);
  return `${code.slice(0, midpoint)}-${code.slice(midpoint)}`;
};
