import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { errorHandler } from './middleware/error-handler';
import { clerkAuth, ensureUser, type AuthEnv } from './middleware/auth';
import { rateLimiter } from './middleware/rate-limiter';
import { health } from './routes/health';
import { sessions } from './routes/sessions';
import { clipsRouter } from './routes/clips';
import { settings } from './routes/settings';
import { createPresignedUrlsRouter } from './routes/presigned-urls';
import { storage } from './routes/storage';
import { createR2ServiceFromEnv } from './services/r2';
import { db } from './db';

const app = new Hono<AuthEnv>();

// Global middleware
app.use('*', logger());
app.onError(errorHandler);

// 1MB body size limit on API routes
app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 }));

// Inject db into context for all routes
app.use('*', async (c, next) => {
  c.set('db', db);
  await next();
});

// Auth + rate limiting on /api/* routes
app.use('/api/*', clerkAuth(), ensureUser());
app.use('/api/*', rateLimiter({ maxRequests: 100, windowMs: 60_000 }));

// Routes
app.route('/', health);
app.route('/', sessions);
app.route('/', clipsRouter);
app.route('/', settings);
app.route('/', storage);
const r2 = createR2ServiceFromEnv();
if (!r2) {
  console.warn('R2 not configured — presigned URL endpoints will return 503');
}
app.route('/', createPresignedUrlsRouter(r2));

const port = Number(process.env.PORT) || 3000;

console.log(`Divot API starting on port ${port}`);

serve({ fetch: app.fetch, port });

export { app };
