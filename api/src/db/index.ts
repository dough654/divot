import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * Creates a Turso/libSQL database client configured from environment variables.
 * Requires TURSO_DATABASE_URL; TURSO_AUTH_TOKEN is optional for local dev.
 */
const createDbClient = () => {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is required');
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, { schema });
};

export const db = createDbClient();
export type Database = ReturnType<typeof createDbClient>;
