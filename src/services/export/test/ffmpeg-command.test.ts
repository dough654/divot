import { describe, it, expect } from 'vitest';
import { buildOverlayCommand, buildCopyCommand } from '../ffmpeg-command';

describe('buildOverlayCommand', () => {
  it('returns correct FFmpeg command with overlay filter', () => {
    const result = buildOverlayCommand({
      videoPath: '/tmp/video.mp4',
      overlayPath: '/tmp/overlay.png',
      outputPath: '/tmp/output.mp4',
    });

    expect(result).toBe(
      '-i "/tmp/video.mp4" -i "/tmp/overlay.png" -filter_complex "[0:v][1:v]overlay=0:0" -c:a copy -y "/tmp/output.mp4"'
    );
  });

  it('handles paths with spaces', () => {
    const result = buildOverlayCommand({
      videoPath: '/tmp/my video.mp4',
      overlayPath: '/tmp/my overlay.png',
      outputPath: '/tmp/my output.mp4',
    });

    expect(result).toContain('"/tmp/my video.mp4"');
    expect(result).toContain('"/tmp/my overlay.png"');
    expect(result).toContain('"/tmp/my output.mp4"');
  });

  it('uses overlay=0:0 positioning without contentRect', () => {
    const result = buildOverlayCommand({
      videoPath: '/a.mp4',
      overlayPath: '/b.png',
      outputPath: '/c.mp4',
    });
    expect(result).toContain('overlay=0:0');
  });

  it('copies audio without re-encoding', () => {
    const result = buildOverlayCommand({
      videoPath: '/a.mp4',
      overlayPath: '/b.png',
      outputPath: '/c.mp4',
    });
    expect(result).toContain('-c:a copy');
  });

  it('overwrites output with -y flag', () => {
    const result = buildOverlayCommand({
      videoPath: '/a.mp4',
      overlayPath: '/b.png',
      outputPath: '/c.mp4',
    });
    expect(result).toContain('-y');
  });

  it('crops and scales overlay when contentRect is provided', () => {
    const result = buildOverlayCommand({
      videoPath: '/video.mp4',
      overlayPath: '/overlay.png',
      outputPath: '/out.mp4',
      contentRect: { x: 0, y: 60, width: 390, height: 220 },
      videoWidth: 1920,
      videoHeight: 1080,
    });

    // Uses min() expressions to clamp crop to overlay bounds (iw/ih)
    expect(result).toContain("crop='min(390,iw-0)':'min(220,ih-60)':0:60");
    expect(result).toContain('scale=1920:1080');
    expect(result).toContain('[ovr];[0:v][ovr]overlay=0:0');
  });

  it('rounds contentRect values to integers', () => {
    const result = buildOverlayCommand({
      videoPath: '/video.mp4',
      overlayPath: '/overlay.png',
      outputPath: '/out.mp4',
      contentRect: { x: 0.5, y: 59.7, width: 389.6, height: 219.3 },
      videoWidth: 1920,
      videoHeight: 1080,
    });

    expect(result).toContain("crop='min(390,iw-1)':'min(219,ih-60)':1:60");
  });

  it('falls back to simple overlay when contentRect is missing video dimensions', () => {
    const result = buildOverlayCommand({
      videoPath: '/a.mp4',
      overlayPath: '/b.png',
      outputPath: '/c.mp4',
      contentRect: { x: 0, y: 60, width: 390, height: 220 },
      // videoWidth/videoHeight missing
    });

    expect(result).toContain('[0:v][1:v]overlay=0:0');
    expect(result).not.toContain('crop');
  });
});

describe('buildCopyCommand', () => {
  it('copies video without re-encoding', () => {
    const result = buildCopyCommand({
      videoPath: '/tmp/video.mp4',
      outputPath: '/tmp/output.mp4',
    });

    expect(result).toBe('-i "/tmp/video.mp4" -c copy -y "/tmp/output.mp4"');
  });

  it('handles paths with spaces', () => {
    const result = buildCopyCommand({
      videoPath: '/tmp/my video.mp4',
      outputPath: '/tmp/my output.mp4',
    });

    expect(result).toContain('"/tmp/my video.mp4"');
    expect(result).toContain('"/tmp/my output.mp4"');
  });

  it('overwrites output with -y flag', () => {
    const result = buildCopyCommand({
      videoPath: '/a.mp4',
      outputPath: '/c.mp4',
    });

    expect(result).toContain('-y');
  });
});
