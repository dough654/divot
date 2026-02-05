import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  generateSessionId,
  isValidRoomCode,
  formatRoomCode,
} from '../room-code-generator';

// Characters that should be in room codes
const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Ambiguous characters that should NOT be in room codes
const EXCLUDED_CHARS = '0O1Il';

describe('generateRoomCode', () => {
  it('generates a 6-character code by default', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it('generates codes of custom length', () => {
    expect(generateRoomCode(4)).toHaveLength(4);
    expect(generateRoomCode(8)).toHaveLength(8);
    expect(generateRoomCode(10)).toHaveLength(10);
  });

  it('only uses valid characters', () => {
    // Generate many codes to increase confidence
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(VALID_CHARS).toContain(char);
      }
    }
  });

  it('excludes ambiguous characters', () => {
    // Generate many codes to ensure ambiguous chars never appear
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(EXCLUDED_CHARS).not.toContain(char);
      }
    }
  });

  it('generates unique codes (statistical test)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }
    // With 31^6 possible codes, 100 should all be unique
    expect(codes.size).toBe(100);
  });
});

describe('generateSessionId', () => {
  it('generates a session ID with expected format', () => {
    const sessionId = generateSessionId();
    // Format: XXXXXXXX-timestamp (8 chars + hyphen + base36 timestamp)
    expect(sessionId).toMatch(/^[A-Z0-9]{8}-[a-z0-9]+$/);
  });

  it('generates unique session IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSessionId());
    }
    expect(ids.size).toBe(100);
  });

  it('contains only valid characters in the code portion', () => {
    const sessionId = generateSessionId();
    const codePortion = sessionId.split('-')[0];
    for (const char of codePortion) {
      expect(VALID_CHARS).toContain(char);
    }
  });
});

describe('isValidRoomCode', () => {
  it('returns true for valid 6-character codes', () => {
    expect(isValidRoomCode('ABC234')).toBe(true);
    expect(isValidRoomCode('XYZABC')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
  });

  it('returns true for codes with all valid characters', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('GHJKLM')).toBe(true);
    expect(isValidRoomCode('NPQRST')).toBe(true);
  });

  it('returns false for codes with wrong length', () => {
    expect(isValidRoomCode('ABC')).toBe(false);
    expect(isValidRoomCode('ABC12')).toBe(false);
    expect(isValidRoomCode('ABC1234')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });

  it('returns false for codes with ambiguous characters', () => {
    expect(isValidRoomCode('ABC0DE')).toBe(false); // 0 (zero)
    expect(isValidRoomCode('ABCODE')).toBe(false); // O (letter)
    expect(isValidRoomCode('ABC1DE')).toBe(false); // 1 (one)
    expect(isValidRoomCode('ABCIDE')).toBe(false); // I (letter)
  });

  it('returns false for lowercase characters', () => {
    expect(isValidRoomCode('abcdef')).toBe(false);
    expect(isValidRoomCode('ABCdef')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    // @ts-expect-error Testing invalid input
    expect(isValidRoomCode(123456)).toBe(false);
    // @ts-expect-error Testing invalid input
    expect(isValidRoomCode(null)).toBe(false);
    // @ts-expect-error Testing invalid input
    expect(isValidRoomCode(undefined)).toBe(false);
  });

  it('validates generated codes', () => {
    // Generated codes should always be valid
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(isValidRoomCode(code)).toBe(true);
    }
  });
});

describe('formatRoomCode', () => {
  it('formats 6-character codes with hyphen in middle', () => {
    expect(formatRoomCode('ABCDEF')).toBe('ABC-DEF');
    expect(formatRoomCode('123456')).toBe('123-456');
  });

  it('handles odd-length codes by putting extra char in first half', () => {
    expect(formatRoomCode('ABCDE')).toBe('ABC-DE');
    expect(formatRoomCode('ABCDEFG')).toBe('ABCD-EFG');
  });

  it('returns short codes unchanged', () => {
    expect(formatRoomCode('AB')).toBe('AB');
    expect(formatRoomCode('ABC')).toBe('ABC');
    expect(formatRoomCode('A')).toBe('A');
  });

  it('handles empty string', () => {
    expect(formatRoomCode('')).toBe('');
  });

  it('formats 4-character codes', () => {
    expect(formatRoomCode('ABCD')).toBe('AB-CD');
  });

  it('formats 8-character codes', () => {
    expect(formatRoomCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});
