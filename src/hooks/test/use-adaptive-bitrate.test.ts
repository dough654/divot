import { describe, it, expect } from 'vitest';
import { qualityPresets, getPresetLabel } from '../use-adaptive-bitrate';
import type { QualityPreset } from '../use-adaptive-bitrate';

describe('qualityPresets', () => {
  it('defines three quality levels', () => {
    expect(Object.keys(qualityPresets)).toEqual(['high', 'medium', 'low']);
  });

  it('high preset has highest bitrate', () => {
    expect(qualityPresets.high.maxBitrate).toBeGreaterThan(qualityPresets.medium.maxBitrate);
    expect(qualityPresets.medium.maxBitrate).toBeGreaterThan(qualityPresets.low.maxBitrate);
  });

  it('high preset has highest framerate', () => {
    expect(qualityPresets.high.maxFramerate).toBeGreaterThanOrEqual(qualityPresets.medium.maxFramerate);
    expect(qualityPresets.medium.maxFramerate).toBeGreaterThanOrEqual(qualityPresets.low.maxFramerate);
  });

  it('low preset has most resolution scaling', () => {
    expect(qualityPresets.low.scaleResolutionDownBy).toBeGreaterThan(qualityPresets.medium.scaleResolutionDownBy);
    expect(qualityPresets.medium.scaleResolutionDownBy).toBeGreaterThanOrEqual(qualityPresets.high.scaleResolutionDownBy);
  });

  it('high preset is full resolution', () => {
    expect(qualityPresets.high.scaleResolutionDownBy).toBe(1.0);
  });

  it('high preset targets 60fps', () => {
    expect(qualityPresets.high.maxFramerate).toBe(60);
  });

  it('low preset targets 24fps minimum', () => {
    expect(qualityPresets.low.maxFramerate).toBe(24);
  });

  describe('bitrate values', () => {
    it('high preset is 2.5 Mbps', () => {
      expect(qualityPresets.high.maxBitrate).toBe(2_500_000);
    });

    it('medium preset is 1.5 Mbps', () => {
      expect(qualityPresets.medium.maxBitrate).toBe(1_500_000);
    });

    it('low preset is 500 Kbps', () => {
      expect(qualityPresets.low.maxBitrate).toBe(500_000);
    });
  });

  describe('all presets have required fields', () => {
    const presets: QualityPreset[] = ['high', 'medium', 'low'];

    for (const preset of presets) {
      it(`${preset} has maxBitrate`, () => {
        expect(qualityPresets[preset].maxBitrate).toBeDefined();
        expect(typeof qualityPresets[preset].maxBitrate).toBe('number');
      });

      it(`${preset} has scaleResolutionDownBy`, () => {
        expect(qualityPresets[preset].scaleResolutionDownBy).toBeDefined();
        expect(typeof qualityPresets[preset].scaleResolutionDownBy).toBe('number');
      });

      it(`${preset} has maxFramerate`, () => {
        expect(qualityPresets[preset].maxFramerate).toBeDefined();
        expect(typeof qualityPresets[preset].maxFramerate).toBe('number');
      });
    }
  });
});

describe('getPresetLabel', () => {
  it('returns "HD (60fps)" for high preset', () => {
    expect(getPresetLabel('high')).toBe('HD (60fps)');
  });

  it('returns "SD (30fps)" for medium preset', () => {
    expect(getPresetLabel('medium')).toBe('SD (30fps)');
  });

  it('returns "Low (24fps)" for low preset', () => {
    expect(getPresetLabel('low')).toBe('Low (24fps)');
  });

  it('includes framerate in all labels', () => {
    expect(getPresetLabel('high')).toContain('fps');
    expect(getPresetLabel('medium')).toContain('fps');
    expect(getPresetLabel('low')).toContain('fps');
  });
});
