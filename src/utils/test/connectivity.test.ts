import { describe, it, expect } from 'vitest';
import { shouldBlockConnection } from '../connectivity';

describe('shouldBlockConnection', () => {
  it('never blocks same-platform connections regardless of internet', () => {
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'ios', isInternetReachable: false })).toBe(false);
    expect(shouldBlockConnection({ localPlatform: 'android', remotePlatform: 'android', isInternetReachable: false })).toBe(false);
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'ios', isInternetReachable: null })).toBe(false);
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'ios', isInternetReachable: true })).toBe(false);
  });

  it('blocks cross-platform connections when internet is unreachable', () => {
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'android', isInternetReachable: false })).toBe(true);
    expect(shouldBlockConnection({ localPlatform: 'android', remotePlatform: 'ios', isInternetReachable: false })).toBe(true);
  });

  it('allows cross-platform connections when internet is reachable', () => {
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'android', isInternetReachable: true })).toBe(false);
    expect(shouldBlockConnection({ localPlatform: 'android', remotePlatform: 'ios', isInternetReachable: true })).toBe(false);
  });

  it('allows cross-platform connections when internet reachability is unknown (null)', () => {
    expect(shouldBlockConnection({ localPlatform: 'ios', remotePlatform: 'android', isInternetReachable: null })).toBe(false);
    expect(shouldBlockConnection({ localPlatform: 'android', remotePlatform: 'ios', isInternetReachable: null })).toBe(false);
  });
});
