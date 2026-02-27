import { Hono } from 'hono';
import { errorHandler } from '../../src/middleware/error-handler';
import { health } from '../../src/routes/health';
import { sessions } from '../../src/routes/sessions';
import { clipsRouter } from '../../src/routes/clips';
import { settings } from '../../src/routes/settings';
import { createPresignedUrlsRouter } from '../../src/routes/presigned-urls';
import type { R2Service } from '../../src/routes/presigned-urls';
import type { AuthEnv } from '../../src/middleware/auth';
import type { Database } from '../../src/db';

/**
 * Creates a test Hono app that bypasses Clerk auth and injects a test db + userId.
 */
export const createTestApp = (db: Database, userId: string, r2?: R2Service | null) => {
  const app = new Hono<AuthEnv>();

  app.onError(errorHandler);

  // Bypass auth — inject db and userId directly
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('userId', userId);
    c.set('clerkId', 'clerk_test_123');
    c.set('email', 'test@example.com');
    await next();
  });

  app.route('/', health);
  app.route('/', sessions);
  app.route('/', clipsRouter);
  app.route('/', settings);
  app.route('/', createPresignedUrlsRouter(r2 ?? null));

  return app;
};
