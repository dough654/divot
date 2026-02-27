import { describe, it, expect } from 'vitest';
import { buildOverlayCommand } from '../ffmpeg-command';

describe('buildOverlayCommand', () => {
  it('returns correct FFmpeg command with overlay filter', () => {
    const result = buildOverlayCommand(
      '/tmp/video.mp4',
      '/tmp/overlay.png',
      '/tmp/output.mp4',
    );

    expect(result).toBe(
      '-i "/tmp/video.mp4" -i "/tmp/overlay.png" -filter_complex "[0:v][1:v]overlay=0:0" -c:a copy -y "/tmp/output.mp4"'
    );
  });

  it('handles paths with spaces', () => {
    const result = buildOverlayCommand(
      '/tmp/my video.mp4',
      '/tmp/my overlay.png',
      '/tmp/my output.mp4',
    );

    expect(result).toContain('"/tmp/my video.mp4"');
    expect(result).toContain('"/tmp/my overlay.png"');
    expect(result).toContain('"/tmp/my output.mp4"');
  });

  it('uses overlay=0:0 positioning', () => {
    const result = buildOverlayCommand('/a.mp4', '/b.png', '/c.mp4');
    expect(result).toContain('overlay=0:0');
  });

  it('copies audio without re-encoding', () => {
    const result = buildOverlayCommand('/a.mp4', '/b.png', '/c.mp4');
    expect(result).toContain('-c:a copy');
  });

  it('overwrites output with -y flag', () => {
    const result = buildOverlayCommand('/a.mp4', '/b.png', '/c.mp4');
    expect(result).toContain('-y');
  });
});
