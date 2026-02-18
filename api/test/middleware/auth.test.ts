import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../src/middleware/error-handler';

describe('auth middleware', () => {
  it('returns 401 when no Authorization header', async () => {
    // Import the real clerkAuth to test header extraction
    // (won't reach Clerk verification since header is missing)
    const { clerkAuth } = await import('../../src/middleware/auth');

    const app = new Hono();
    app.onError(errorHandler);
    app.use('/test', clerkAuth());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toMatch(/Authorization/);
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const { clerkAuth } = await import('../../src/middleware/auth');

    const app = new Hono();
    app.onError(errorHandler);
    app.use('/test', clerkAuth());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });
});

describe('error handler', () => {
  it('returns structured JSON for thrown HTTPExceptions', async () => {
    const { HTTPException } = await import('hono/http-exception');

    const app = new Hono();
    app.onError(errorHandler);
    app.get('/boom', () => {
      throw new HTTPException(422, { message: 'Bad data' });
    });

    const res = await app.request('/boom');
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toBe('Bad data');
  });

  it('returns 500 for unexpected errors', async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.get('/crash', () => {
      throw new Error('Something broke');
    });

    const res = await app.request('/crash');
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});
