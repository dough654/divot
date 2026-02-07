import { describe, it, expect } from 'vitest';
import { packPayload, unpackPayload } from '../ble-payload';

describe('ble-payload', () => {
  describe('packPayload', () => {
    it('packs an iOS payload correctly', () => {
      const result = packPayload({ roomCode: 'ABC123', platform: 'ios' });

      expect(result.length).toBe(8);
      expect(result[0]).toBe(0x01); // iOS platform byte
      expect(result[1]).toBe(0x41); // 'A'
      expect(result[2]).toBe(0x42); // 'B'
      expect(result[3]).toBe(0x43); // 'C'
      expect(result[4]).toBe(0x31); // '1'
      expect(result[5]).toBe(0x32); // '2'
      expect(result[6]).toBe(0x33); // '3'
      expect(result[7]).toBe(0x10); // version=1, status=0
    });

    it('packs an Android payload correctly', () => {
      const result = packPayload({ roomCode: 'XYZ789', platform: 'android' });

      expect(result[0]).toBe(0x02); // Android platform byte
    });

    it('zero-pads room codes shorter than 6 chars', () => {
      const result = packPayload({ roomCode: 'AB', platform: 'ios' });

      expect(result[1]).toBe(0x41); // 'A'
      expect(result[2]).toBe(0x42); // 'B'
      expect(result[3]).toBe(0x00);
      expect(result[4]).toBe(0x00);
      expect(result[5]).toBe(0x00);
      expect(result[6]).toBe(0x00);
    });

    it('truncates room codes longer than 6 chars', () => {
      const result = packPayload({ roomCode: 'ABCDEFGH', platform: 'ios' });

      expect(result[1]).toBe(0x41); // 'A'
      expect(result[6]).toBe(0x46); // 'F'
      // 'G' and 'H' should not appear
    });
  });

  describe('unpackPayload', () => {
    it('round-trips an iOS payload', () => {
      const packed = packPayload({ roomCode: 'ABC123', platform: 'ios' });
      const result = unpackPayload(packed);

      expect(result).toEqual({
        platform: 'ios',
        roomCode: 'ABC123',
        protocolVersion: 1,
        statusBits: 0,
      });
    });

    it('round-trips an Android payload', () => {
      const packed = packPayload({ roomCode: 'XYZ789', platform: 'android' });
      const result = unpackPayload(packed);

      expect(result).toEqual({
        platform: 'android',
        roomCode: 'XYZ789',
        protocolVersion: 1,
        statusBits: 0,
      });
    });

    it('round-trips a short room code', () => {
      const packed = packPayload({ roomCode: 'AB', platform: 'ios' });
      const result = unpackPayload(packed);

      expect(result).not.toBeNull();
      expect(result!.roomCode).toBe('AB');
    });

    it('returns null for data shorter than 8 bytes', () => {
      const result = unpackPayload(new Uint8Array([0x01, 0x41]));
      expect(result).toBeNull();
    });

    it('returns null for unknown platform byte', () => {
      const data = new Uint8Array([0xff, 0x41, 0x42, 0x43, 0x31, 0x32, 0x33, 0x10]);
      const result = unpackPayload(data);
      expect(result).toBeNull();
    });

    it('returns null for empty room code (all zeros)', () => {
      const data = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10]);
      const result = unpackPayload(data);
      expect(result).toBeNull();
    });

    it('parses flags correctly', () => {
      const data = new Uint8Array([0x01, 0x41, 0x42, 0x43, 0x31, 0x32, 0x33, 0x00]);
      // flags=0x00 means version=0, status=0
      const result = unpackPayload(data);
      expect(result).not.toBeNull();
      expect(result!.protocolVersion).toBe(0);
      expect(result!.statusBits).toBe(0);
    });
  });
});
