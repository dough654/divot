import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { HTTPException } from 'hono/http-exception';
import { userSettings } from '../db/schema';
import type { AuthEnv } from '../middleware/auth';

const settings = new Hono<AuthEnv>();

const settingKeySchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, {
  message: 'Setting key must be alphanumeric with dots, dashes, or underscores',
});

const upsertSettingSchema = z.object({
  value: z.string().max(50_000),
});

/** GET /api/settings — get all settings for the authenticated user */
settings.get('/api/settings', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');

  const results = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .all();

  return c.json({ data: results });
});

/** PUT /api/settings/:key — upsert a setting */
settings.put('/api/settings/:key', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const rawKey = c.req.param('key');

  const keyResult = settingKeySchema.safeParse(rawKey);
  if (!keyResult.success) {
    throw new HTTPException(400, { message: keyResult.error.issues[0].message });
  }
  const key = keyResult.data;

  const body = await c.req.json();
  const parsed = upsertSettingSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0].message });
  }

  const now = new Date().toISOString();

  const existing = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
    .get();

  if (existing) {
    await db
      .update(userSettings)
      .set({ value: parsed.data.value, updatedAt: now })
      .where(eq(userSettings.id, existing.id));
  } else {
    await db.insert(userSettings).values({
      id: ulid(),
      userId,
      key,
      value: parsed.data.value,
      createdAt: now,
      updatedAt: now,
    });
  }

  const setting = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
    .get();

  return c.json({ data: setting });
});

/** DELETE /api/settings/:key — delete a setting */
settings.delete('/api/settings/:key', async (c) => {
  const db = c.get('db');
  const userId = c.get('userId');
  const rawKey = c.req.param('key');

  const keyResult = settingKeySchema.safeParse(rawKey);
  if (!keyResult.success) {
    throw new HTTPException(400, { message: keyResult.error.issues[0].message });
  }
  const key = keyResult.data;

  const existing = await db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
    .get();

  if (!existing) {
    throw new HTTPException(404, { message: 'Setting not found' });
  }

  await db.delete(userSettings).where(eq(userSettings.id, existing.id));
  return c.json({ success: true });
});

export { settings };
