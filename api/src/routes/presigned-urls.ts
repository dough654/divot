import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

const presignedUrls = new Hono<AuthEnv>();

/** POST /api/presigned-urls/upload — stub for R2 upload (GOL-97) */
presignedUrls.post('/api/presigned-urls/upload', (c) => {
  return c.json({ error: 'Upload not yet implemented — see GOL-97' }, 501);
});

/** POST /api/presigned-urls/download — stub for R2 download (GOL-97) */
presignedUrls.post('/api/presigned-urls/download', (c) => {
  return c.json({ error: 'Download not yet implemented — see GOL-97' }, 501);
});

export { presignedUrls };
