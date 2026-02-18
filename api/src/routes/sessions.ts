import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { HTTPException } from 'hono/http-exception';
import { swingSessions, clips } from '../db/schema';
import type { AuthEnv } from '../middleware/auth';

const sessions = new Hono<AuthEnv>();

const createSessionSchema = z.object({
  recordedAt: z.string().max(50),
  endedAt: z.string().max(50).nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  deviceInfo: z.string().max(1000).nullable().optional(),
  clubType: z.string().max(100).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  locationDisplayName: z.string().max(500).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

const updateSessionSchema = z.object({
  endedAt: z.string().max(50).nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  clubType: z.string().max(100).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

/** GET /api/sessions — list user's sessions, paginated */
sessions.get('/api/sessions', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '', 10) || 20, 100);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '', 10) || 0, 0);

  const results = await db
    .select()
    .from(swingSessions)
    .where(eq(swingSessions.userId, userId))
    .orderBy(desc(swingSessions.recordedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(swingSessions)
    .where(eq(swingSessions.userId, userId))
    .all();

  return c.json({ data: results, total: countResult.count, limit, offset });
});

/** POST /api/sessions — create a new session */
sessions.post('/api/sessions', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0].message });
  }

  const id = ulid();
  const now = new Date().toISOString();

  await db.insert(swingSessions).values({
    id,
    userId,
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
  });

  const session = await db.select().from(swingSessions).where(eq(swingSessions.id, id)).get();
  return c.json({ data: session }, 201);
});

/** GET /api/sessions/:id — get session with clips */
sessions.get('/api/sessions/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const session = await db
    .select()
    .from(swingSessions)
    .where(and(eq(swingSessions.id, sessionId), eq(swingSessions.userId, userId)))
    .get();

  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  const sessionClips = await db
    .select()
    .from(clips)
    .where(eq(clips.sessionId, sessionId))
    .orderBy(clips.clipOrder)
    .all();

  return c.json({ data: { ...session, clips: sessionClips } });
});

/** PATCH /api/sessions/:id — update session */
sessions.patch('/api/sessions/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const existing = await db
    .select()
    .from(swingSessions)
    .where(and(eq(swingSessions.id, sessionId), eq(swingSessions.userId, userId)))
    .get();

  if (!existing) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  const body = await c.req.json();
  const parsed = updateSessionSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0].message });
  }

  await db
    .update(swingSessions)
    .set({ ...parsed.data, updatedAt: new Date().toISOString() })
    .where(eq(swingSessions.id, sessionId));

  const updated = await db.select().from(swingSessions).where(eq(swingSessions.id, sessionId)).get();
  return c.json({ data: updated });
});

/** DELETE /api/sessions/:id — delete session (cascades clips) */
sessions.delete('/api/sessions/:id', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  const existing = await db
    .select()
    .from(swingSessions)
    .where(and(eq(swingSessions.id, sessionId), eq(swingSessions.userId, userId)))
    .get();

  if (!existing) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  await db.delete(swingSessions).where(eq(swingSessions.id, sessionId));
  return c.json({ success: true });
});

export { sessions };
