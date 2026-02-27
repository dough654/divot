import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { clips, swingSessions } from '../db/schema';
import { buildStorageKey } from '../services/r2';
import type { AuthEnv } from '../middleware/auth';

type R2Service = {
  generateUploadUrl: (params: { key: string; contentType: string; expiresIn?: number }) => Promise<{ url: string; expiresIn: number }>;
  generateDownloadUrl: (params: { key: string; expiresIn?: number }) => Promise<{ url: string; expiresIn: number }>;
};

type PresignedUrlsEnv = AuthEnv & {
  Variables: AuthEnv['Variables'] & {
    r2: R2Service | null;
  };
};

const uploadSchema = z.object({
  clipId: z.string().min(1),
  contentType: z.string().min(1),
  type: z.enum(['video', 'thumbnail']).default('video'),
});

const downloadSchema = z.object({
  clipId: z.string().min(1),
  type: z.enum(['video', 'thumbnail']).default('video'),
});

/**
 * Creates the presigned URLs router. Accepts an R2 service instance (or null if not configured).
 */
const createPresignedUrlsRouter = (r2: R2Service | null) => {
  const router = new Hono<PresignedUrlsEnv>();

  /**
   * Verifies clip ownership via the parent session.
   */
  const verifyClipOwnership = async (
    db: AuthEnv['Variables']['db'],
    clipId: string,
    userId: string,
  ) => {
    const clip = await db.select().from(clips).where(eq(clips.id, clipId)).get();

    if (!clip) {
      throw new HTTPException(404, { message: 'Clip not found' });
    }

    const session = await db
      .select()
      .from(swingSessions)
      .where(and(eq(swingSessions.id, clip.sessionId), eq(swingSessions.userId, userId)))
      .get();

    if (!session) {
      throw new HTTPException(404, { message: 'Clip not found' });
    }

    return clip;
  };

  /** POST /api/presigned-urls/upload — generate a presigned PUT URL for R2 */
  router.post('/api/presigned-urls/upload', async (c) => {
    if (!r2) {
      throw new HTTPException(503, { message: 'Cloud storage is not configured' });
    }

    const db = c.get('db');
    const userId = c.get('userId');
    const body = await c.req.json();
    const parsed = uploadSchema.safeParse(body);

    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0].message });
    }

    const { clipId, contentType, type } = parsed.data;

    await verifyClipOwnership(db, clipId, userId);

    const extension = type === 'thumbnail' ? 'jpg' : contentType.split('/')[1] || 'mp4';
    const storageKey = buildStorageKey({ userId, clipId, type, extension });

    const { url, expiresIn } = await r2.generateUploadUrl({
      key: storageKey,
      contentType,
    });

    return c.json({ data: { url, storageKey, expiresIn } });
  });

  /** POST /api/presigned-urls/download — generate a presigned GET URL for R2 */
  router.post('/api/presigned-urls/download', async (c) => {
    if (!r2) {
      throw new HTTPException(503, { message: 'Cloud storage is not configured' });
    }

    const db = c.get('db');
    const userId = c.get('userId');
    const body = await c.req.json();
    const parsed = downloadSchema.safeParse(body);

    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.issues[0].message });
    }

    const { clipId, type } = parsed.data;

    const clip = await verifyClipOwnership(db, clipId, userId);

    const storageKey = type === 'thumbnail' ? clip.thumbnailKey : clip.storageKey;

    if (!storageKey) {
      throw new HTTPException(404, { message: `No ${type} uploaded for this clip` });
    }

    const { url, expiresIn } = await r2.generateDownloadUrl({ key: storageKey });

    return c.json({ data: { url, expiresIn } });
  });

  return router;
};

export { createPresignedUrlsRouter };
export type { R2Service };
