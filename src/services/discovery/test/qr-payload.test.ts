import { describe, it, expect } from 'vitest';
import {
  encodeQRPayload,
  decodeQRPayload,
  createAutoModePayload,
  createHotspotModePayload,
  isValidDivotQR,
} from '../qr-payload';
import type { QRCodePayload } from '@/src/types';

describe('encodeQRPayload', () => {
  it('encodes a minimal auto-mode payload', () => {
    const payload: QRCodePayload = {
      sessionId: 'ABC123',
      mode: 'auto',
    };
    const encoded = encodeQRPayload(payload);

    expect(encoded).toMatch(/^DIVOT:/);
    // Should be decodable
    const decoded = decodeQRPayload(encoded);
    expect(decoded?.sessionId).toBe('ABC123');
    expect(decoded?.mode).toBe('auto');
  });

  it('encodes a hotspot-mode payload with credentials', () => {
    const payload: QRCodePayload = {
      sessionId: 'XYZ789',
      mode: 'hotspot',
      hotspotSsid: 'MyPhone',
      hotspotPassword: 'secret123',
    };
    const encoded = encodeQRPayload(payload);

    expect(encoded).toMatch(/^DIVOT:/);
    const decoded = decodeQRPayload(encoded);
    expect(decoded?.sessionId).toBe('XYZ789');
    expect(decoded?.mode).toBe('hotspot');
    expect(decoded?.hotspotSsid).toBe('MyPhone');
    expect(decoded?.hotspotPassword).toBe('secret123');
  });

  it('encodes optional fields', () => {
    const payload: QRCodePayload = {
      sessionId: 'TEST01',
      mode: 'auto',
      localIp: '192.168.1.100',
      signalingUrl: 'wss://signal.example.com',
    };
    const encoded = encodeQRPayload(payload);
    const decoded = decodeQRPayload(encoded);

    expect(decoded?.localIp).toBe('192.168.1.100');
    expect(decoded?.signalingUrl).toBe('wss://signal.example.com');
  });

  it('handles special characters in payload values', () => {
    const payload: QRCodePayload = {
      sessionId: 'TEST-123',
      mode: 'hotspot',
      hotspotSsid: 'My WiFi Network!',
      hotspotPassword: 'p@ss=word&123',
    };
    const encoded = encodeQRPayload(payload);
    const decoded = decodeQRPayload(encoded);

    expect(decoded?.hotspotSsid).toBe('My WiFi Network!');
    expect(decoded?.hotspotPassword).toBe('p@ss=word&123');
  });
});

describe('decodeQRPayload', () => {
  it('returns null for strings without SWINGLINK prefix', () => {
    expect(decodeQRPayload('random-string')).toBeNull();
    expect(decodeQRPayload('http://example.com')).toBeNull();
    expect(decodeQRPayload('')).toBeNull();
  });

  it('returns null for invalid base64 after prefix', () => {
    expect(decodeQRPayload('DIVOT:not-valid-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    const invalidJson = btoa('not json');
    expect(decodeQRPayload(`DIVOT:${invalidJson}`)).toBeNull();
  });

  it('returns null when sessionId is missing', () => {
    const payload = btoa(JSON.stringify({ mode: 'auto' }));
    expect(decodeQRPayload(`DIVOT:${payload}`)).toBeNull();
  });

  it('returns null when sessionId is not a string', () => {
    const payload = btoa(JSON.stringify({ sessionId: 123, mode: 'auto' }));
    expect(decodeQRPayload(`DIVOT:${payload}`)).toBeNull();
  });

  it('returns null for invalid mode values', () => {
    const payload = btoa(JSON.stringify({ sessionId: 'TEST', mode: 'invalid' }));
    expect(decodeQRPayload(`DIVOT:${payload}`)).toBeNull();
  });

  it('defaults mode to "auto" when not specified', () => {
    const payload = btoa(JSON.stringify({ sessionId: 'TEST', v: 1 }));
    const decoded = decodeQRPayload(`DIVOT:${payload}`);
    expect(decoded?.mode).toBe('auto');
  });

  it('preserves undefined optional fields as undefined', () => {
    const payload: QRCodePayload = {
      sessionId: 'TEST',
      mode: 'auto',
    };
    const encoded = encodeQRPayload(payload);
    const decoded = decodeQRPayload(encoded);

    expect(decoded?.hotspotSsid).toBeUndefined();
    expect(decoded?.hotspotPassword).toBeUndefined();
    expect(decoded?.localIp).toBeUndefined();
    expect(decoded?.signalingUrl).toBeUndefined();
  });
});

describe('createAutoModePayload', () => {
  it('creates payload with required sessionId', () => {
    const payload = createAutoModePayload({ sessionId: 'ABC123' });

    expect(payload.sessionId).toBe('ABC123');
    expect(payload.mode).toBe('auto');
  });

  it('includes optional localIp', () => {
    const payload = createAutoModePayload({
      sessionId: 'ABC123',
      localIp: '192.168.1.50',
    });

    expect(payload.localIp).toBe('192.168.1.50');
  });

  it('includes optional signalingUrl', () => {
    const payload = createAutoModePayload({
      sessionId: 'ABC123',
      signalingUrl: 'wss://custom.server.com',
    });

    expect(payload.signalingUrl).toBe('wss://custom.server.com');
  });
});

describe('createHotspotModePayload', () => {
  it('creates payload with required fields', () => {
    const payload = createHotspotModePayload({
      sessionId: 'XYZ789',
      hotspotSsid: 'iPhone',
      hotspotPassword: 'password123',
    });

    expect(payload.sessionId).toBe('XYZ789');
    expect(payload.mode).toBe('hotspot');
    expect(payload.hotspotSsid).toBe('iPhone');
    expect(payload.hotspotPassword).toBe('password123');
  });

  it('includes optional signalingUrl', () => {
    const payload = createHotspotModePayload({
      sessionId: 'XYZ789',
      hotspotSsid: 'iPhone',
      hotspotPassword: 'password123',
      signalingUrl: 'wss://signal.example.com',
    });

    expect(payload.signalingUrl).toBe('wss://signal.example.com');
  });
});

describe('isValidDivotQR', () => {
  it('returns true for valid auto-mode QR', () => {
    const encoded = encodeQRPayload({
      sessionId: 'TEST01',
      mode: 'auto',
    });
    expect(isValidDivotQR(encoded)).toBe(true);
  });

  it('returns true for valid hotspot-mode QR', () => {
    const encoded = encodeQRPayload({
      sessionId: 'TEST02',
      mode: 'hotspot',
      hotspotSsid: 'Test',
      hotspotPassword: 'pass',
    });
    expect(isValidDivotQR(encoded)).toBe(true);
  });

  it('returns false for random strings', () => {
    expect(isValidDivotQR('hello world')).toBe(false);
    expect(isValidDivotQR('')).toBe(false);
    expect(isValidDivotQR('https://example.com')).toBe(false);
  });

  it('returns false for malformed SWINGLINK strings', () => {
    expect(isValidDivotQR('DIVOT:')).toBe(false);
    expect(isValidDivotQR('DIVOT:invalid')).toBe(false);
  });
});

describe('round-trip encoding/decoding', () => {
  it('preserves all fields through encode/decode cycle', () => {
    const original: QRCodePayload = {
      sessionId: 'ROUND-TRIP',
      mode: 'hotspot',
      hotspotSsid: 'Test Network',
      hotspotPassword: 'complex!@#$%^&*()',
      localIp: '10.0.0.1',
      signalingUrl: 'wss://signaling.divotgolf.app/ws',
    };

    const encoded = encodeQRPayload(original);
    const decoded = decodeQRPayload(encoded);

    expect(decoded).toEqual(original);
  });

  it('handles unicode characters', () => {
    const original: QRCodePayload = {
      sessionId: 'UNICODE-TEST',
      mode: 'hotspot',
      hotspotSsid: '我的网络 🏌️',
      hotspotPassword: 'пароль123',
    };

    const encoded = encodeQRPayload(original);
    const decoded = decodeQRPayload(encoded);

    expect(decoded?.hotspotSsid).toBe('我的网络 🏌️');
    expect(decoded?.hotspotPassword).toBe('пароль123');
  });
});
