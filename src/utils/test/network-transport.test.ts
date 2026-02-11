import { describe, it, expect } from 'vitest';
import { resolveNetworkTransport, getTransportDisplay } from '../network-transport';

describe('resolveNetworkTransport', () => {
  it('returns null when activeTransport is null', () => {
    expect(resolveNetworkTransport(null)).toBeNull();
    expect(resolveNetworkTransport(null, 'host')).toBeNull();
  });

  it('returns "p2p" for p2p transport regardless of candidate type', () => {
    expect(resolveNetworkTransport('p2p')).toBe('p2p');
    expect(resolveNetworkTransport('p2p', 'host')).toBe('p2p');
    expect(resolveNetworkTransport('p2p', 'srflx')).toBe('p2p');
    expect(resolveNetworkTransport('p2p', 'prflx')).toBe('p2p');
    expect(resolveNetworkTransport('p2p', 'relay')).toBe('p2p');
  });

  it('returns null for server transport with no candidate type', () => {
    expect(resolveNetworkTransport('server')).toBeNull();
    expect(resolveNetworkTransport('server', undefined)).toBeNull();
  });

  it('returns "wifi" for server transport with host candidate', () => {
    expect(resolveNetworkTransport('server', 'host')).toBe('wifi');
  });

  it('returns "internet" for server transport with srflx candidate', () => {
    expect(resolveNetworkTransport('server', 'srflx')).toBe('internet');
  });

  it('returns "internet" for server transport with prflx candidate', () => {
    expect(resolveNetworkTransport('server', 'prflx')).toBe('internet');
  });

  it('returns "internet" for server transport with relay candidate', () => {
    expect(resolveNetworkTransport('server', 'relay')).toBe('internet');
  });
});

describe('getTransportDisplay', () => {
  it('returns purple P2P display for p2p transport', () => {
    const display = getTransportDisplay('p2p');
    expect(display.label).toBe('P2P');
    expect(display.icon).toBe('radio');
    expect(display.color).toBe('#7C6BFF');
  });

  it('returns green WiFi display for wifi transport', () => {
    const display = getTransportDisplay('wifi');
    expect(display.label).toBe('WiFi');
    expect(display.icon).toBe('wifi');
    expect(display.color).toBe('#00CC66');
  });

  it('returns gray Internet display for internet transport', () => {
    const display = getTransportDisplay('internet');
    expect(display.label).toBe('Internet');
    expect(display.icon).toBe('globe-outline');
  });

  it('returns non-empty backgroundColor for all transports', () => {
    expect(getTransportDisplay('p2p').backgroundColor).toBeTruthy();
    expect(getTransportDisplay('wifi').backgroundColor).toBeTruthy();
    expect(getTransportDisplay('internet').backgroundColor).toBeTruthy();
  });
});
