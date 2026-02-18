import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { users } from '../db/schema';
import type { Database } from '../db';

export type AuthEnv = {
  Variables: {
    clerkId: string;
    email: string | null;
    userId: string;
    db: Database;
  };
};

/**
 * Extracts and verifies the Bearer token using Clerk.
 * Sets `clerkId` and `email` on the context.
 */
export const clerkAuth = () =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.error('CLERK_SECRET_KEY environment variable is not set');
      throw new HTTPException(500, { message: 'Internal server error' });
    }

    try {
      const verifyOptions: Parameters<typeof verifyToken>[1] = { secretKey };

      const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES;
      if (authorizedParties) {
        verifyOptions.authorizedParties = authorizedParties.split(',').map((s) => s.trim());
      }

      const payload = await verifyToken(token, verifyOptions);

      c.set('clerkId', payload.sub);
      c.set('email', (payload as Record<string, unknown>).email as string | null ?? null);
    } catch {
      throw new HTTPException(401, { message: 'Invalid or expired token' });
    }

    await next();
  });

/**
 * Upserts the user record by clerkId and sets internal `userId` on context.
 * Uses INSERT ON CONFLICT to avoid race conditions with concurrent first requests.
 * Must be called after `clerkAuth()`.
 */
export const ensureUser = () =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const db = c.get('db');
    const clerkId = c.get('clerkId');
    const email = c.get('email');

    // Insert-or-ignore, then select — avoids TOCTOU race on first request
    const id = ulid();
    await db
      .insert(users)
      .values({ id, clerkId, email })
      .onConflictDoNothing({ target: users.clerkId });

    const user = await db.select().from(users).where(eq(users.clerkId, clerkId)).get();
    c.set('userId', user!.id);

    await next();
  });
