import type { Session } from '../types/session';
import type { Clip } from '../types/recording';
import { formatRelativeDate, formatDuration, formatSessionDuration } from './format';

/**
 * Builds a plain-text summary of a session for sharing.
 * Pure function — no side effects, fully testable.
 */
export const buildSessionSummaryText = (session: Session, clips: Clip[]): string => {
  const lines: string[] = [];

  lines.push('Divot Session Summary');
  lines.push('========================');
  lines.push('');

  lines.push(`Date: ${formatRelativeDate(session.startedAt)}`);
  lines.push(`Duration: ${formatSessionDuration(session.startedAt, session.endedAt)}`);

  if (session.location?.displayName) {
    lines.push(`Location: ${session.location.displayName}`);
  }

  lines.push(`Clips: ${clips.length}`);

  if (clips.length > 0) {
    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
    lines.push(`Total recording time: ${formatDuration(totalDuration)}`);
  }

  if (session.notes) {
    lines.push('');
    lines.push(`Notes: ${session.notes}`);
  }

  if (clips.length > 0) {
    lines.push('');
    lines.push('Clips:');
    clips.forEach((clip, i) => {
      const name = clip.name || `Swing ${i + 1}`;
      lines.push(`  ${i + 1}. ${name} (${formatDuration(clip.duration)})`);
    });
  }

  return lines.join('\n');
};
