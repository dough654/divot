import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { clips, swingSessions } from '../db/schema';
import type { AuthEnv } from '../middleware/auth';

const PRO_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

const storage = new Hono<AuthEnv>();

/** GET /api/storage/usage — returns used bytes, quota, and clip count for the authenticated user. */
storage.get('/api/storage/usage', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');

  // Get all session IDs for this user, then sum file_size across their clips
  const result = await db
    .select({
      usedBytes: sql<number>`coalesce(sum(${clips.fileSize}), 0)`,
      clipCount: sql<number>`count(${clips.id})`,
    })
    .from(clips)
    .innerJoin(swingSessions, eq(clips.sessionId, swingSessions.id))
    .where(eq(swingSessions.userId, userId))
    .get();

  return c.json({
    data: {
      usedBytes: result?.usedBytes ?? 0,
      quotaBytes: PRO_QUOTA_BYTES,
      clipCount: result?.clipCount ?? 0,
    },
  });
});

export { storage };
