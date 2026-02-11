import { describe, it, expect } from 'vitest';
import { formatDuration, formatFileSize, formatSessionDuration } from '../format';

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(59)).toBe('0:59');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(83)).toBe('1:23');
    expect(formatDuration(605)).toBe('10:05');
  });

  it('formats hours', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('handles negative values gracefully', () => {
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatDuration(1.9)).toBe('0:01');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB');
  });
});

describe('formatSessionDuration', () => {
  const start = 1700000000000;

  it('returns "In progress" when endedAt is null', () => {
    expect(formatSessionDuration(start, null)).toBe('In progress');
  });

  it('returns "<1 min" for very short sessions', () => {
    expect(formatSessionDuration(start, start + 30_000)).toBe('<1 min');
  });

  it('formats minutes', () => {
    expect(formatSessionDuration(start, start + 5 * 60_000)).toBe('5 min');
    expect(formatSessionDuration(start, start + 45 * 60_000)).toBe('45 min');
  });

  it('formats hours only when no remaining minutes', () => {
    expect(formatSessionDuration(start, start + 60 * 60_000)).toBe('1h');
    expect(formatSessionDuration(start, start + 120 * 60_000)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(formatSessionDuration(start, start + 80 * 60_000)).toBe('1h 20min');
    expect(formatSessionDuration(start, start + 150 * 60_000)).toBe('2h 30min');
  });
});
