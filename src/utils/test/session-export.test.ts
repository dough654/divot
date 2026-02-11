import { describe, it, expect } from 'vitest';
import { buildSessionSummaryText } from '../session-export';
import type { Session } from '../../types/session';
import type { Clip } from '../../types/recording';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'session-test-abc123',
  startedAt: 1700000000000,
  endedAt: 1700002700000, // 45 minutes later
  clipIds: [],
  role: 'camera',
  ...overrides,
});

const makeClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  path: '/fake/path.mp4',
  duration: 5,
  timestamp: 1700000100000,
  fileSize: 1024 * 1024,
  fps: 30,
  ...overrides,
});

describe('buildSessionSummaryText', () => {
  it('includes basic session info', () => {
    const session = makeSession();
    const text = buildSessionSummaryText(session, []);

    expect(text).toContain('SwingLink Session Summary');
    expect(text).toContain('Duration: 45 min');
    expect(text).toContain('Clips: 0');
  });

  it('includes location when present', () => {
    const session = makeSession({
      location: { latitude: 30.27, longitude: -97.74, displayName: 'Austin, TX' },
    });
    const text = buildSessionSummaryText(session, []);

    expect(text).toContain('Location: Austin, TX');
  });

  it('omits location line when no location', () => {
    const session = makeSession();
    const text = buildSessionSummaryText(session, []);

    expect(text).not.toContain('Location:');
  });

  it('includes notes when present', () => {
    const session = makeSession({ notes: 'Worked on driver swing' });
    const text = buildSessionSummaryText(session, []);

    expect(text).toContain('Notes: Worked on driver swing');
  });

  it('lists clips with duration', () => {
    const clips = [
      makeClip({ id: 'c1', name: 'Driver', duration: 5 }),
      makeClip({ id: 'c2', duration: 83 }),
    ];
    const session = makeSession({ clipIds: ['c1', 'c2'] });
    const text = buildSessionSummaryText(session, clips);

    expect(text).toContain('Clips: 2');
    expect(text).toContain('1. Driver (0:05)');
    expect(text).toContain('2. Swing 2 (1:23)');
    expect(text).toContain('Total recording time: 1:28');
  });

  it('handles session still in progress', () => {
    const session = makeSession({ endedAt: null });
    const text = buildSessionSummaryText(session, []);

    expect(text).toContain('Duration: In progress');
  });
});
