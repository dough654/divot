import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { HTTPException } from 'hono/http-exception';
import { clips, swingSessions } from '../db/schema';
import type { AuthEnv } from '../middleware/auth';

const clipsRouter = new Hono<AuthEnv>();

const createClipSchema = z.object({
  sessionId: z.string().max(50),
  storageKey: z.string().max(500).nullable().optional(),
  thumbnailKey: z.string().max(500).nullable().optional(),
  fileSize: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  fps: z.number().nullable().optional(),
  clipOrder: z.number().nullable().optional(),
  name: z.string().max(500).nullable().optional(),
});

const updateClipSchema = z.object({
  name: z.string().max(500).nullable().optional(),
  storageKey: z.string().max(500).nullable().optional(),
  thumbnailKey: z.string().max(500).nullable().optional(),
});

/**
 * Verifies that the given session belongs to the authenticated user.
 * Returns the session or throws 404.
 */
const verifySessionOwnership = async (db: AuthEnv['Variables']['db'], sessionId: string, userId: string) => {
  const session = await db
    .select()
    .from(swingSessions)
    .where(and(eq(swingSessions.id, sessionId), eq(swingSessions.userId, userId)))
    .get();

  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  return session;
};

/**
 * Verifies clip ownership via the parent session.
 * Returns the clip or throws 404.
 */
const verifyClipOwnership = async (db: AuthEnv['Variables']['db'], clipId: string, userId: string) => {
  const clip = await db.select().from(clips).where(eq(clips.id, clipId)).get();

  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  await verifySessionOwnership(db, clip.sessionId, userId);
  return clip;
};

/** GET /api/clips?sessionId=x — list clips for a session */
clipsRouter.get('/api/clips', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const sessionId = c.req.query('sessionId');

  if (!sessionId) {
    throw new HTTPException(400, { message: 'sessionId query parameter is required' });
  }

  await verifySessionOwnership(db, sessionId, userId);

  const results = await db
    .select()
    .from(clips)
    .where(eq(clips.sessionId, sessionId))
    .orderBy(clips.clipOrder)
    .all();

  return c.json({ data: results });
});

/** POST /api/clips — create clip metadata */
clipsRouter.post('/api/clips', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createClipSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0].message });
  }

  await verifySessionOwnership(db, parsed.data.sessionId, userId);

  const id = ulid();
  const now = new Date().toISOString();

  await db.insert(clips).values({
    id,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  });

  const clip = await db.select().from(clips).where(eq(clips.id, id)).get();
  return c.json({ data: clip }, 201);
});

/** GET /api/clips/:id — get a single clip */
clipsRouter.get('/api/clips/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const clipId = c.req.param('id');

  const clip = await verifyClipOwnership(db, clipId, userId);
  return c.json({ data: clip });
});

/** PATCH /api/clips/:id — update clip name/storageKey */
clipsRouter.patch('/api/clips/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const clipId = c.req.param('id');

  await verifyClipOwnership(db, clipId, userId);

  const body = await c.req.json();
  const parsed = updateClipSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0].message });
  }

  await db
    .update(clips)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(clips.id, clipId));

  const updated = await db.select().from(clips).where(eq(clips.id, clipId)).get();
  return c.json({ data: updated });
});

/** DELETE /api/clips/:id — delete a clip */
clipsRouter.delete('/api/clips/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const clipId = c.req.param('id');

  await verifyClipOwnership(db, clipId, userId);

  await db.delete(clips).where(eq(clips.id, clipId));
  return c.json({ success: true });
});

export { clipsRouter };
