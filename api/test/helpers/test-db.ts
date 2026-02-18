import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import type { Database } from '../../src/db';

/**
 * Creates a fresh in-memory libSQL database with all tables applied.
 * Each test file should call this in beforeEach for full isolation.
 */
export const createTestDb = async (): Promise<Database> => {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  // Create tables directly — matches schema.ts definitions
  await db.run(sql`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      clerk_id TEXT NOT NULL UNIQUE,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE TABLE swing_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds REAL,
      device_info TEXT,
      club_type TEXT,
      notes TEXT,
      location_display_name TEXT,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE INDEX swing_sessions_user_id_idx ON swing_sessions(user_id)
  `);

  await db.run(sql`
    CREATE INDEX swing_sessions_user_recorded_idx ON swing_sessions(user_id, recorded_at)
  `);

  await db.run(sql`
    CREATE TABLE clips (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES swing_sessions(id) ON DELETE CASCADE,
      storage_key TEXT,
      thumbnail_key TEXT,
      file_size INTEGER,
      duration_seconds REAL,
      fps INTEGER,
      clip_order INTEGER,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE INDEX clips_session_id_idx ON clips(session_id)
  `);

  await db.run(sql`
    CREATE TABLE user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX user_settings_user_key_idx ON user_settings(user_id, key)
  `);

  // Enable foreign keys for in-memory SQLite
  await db.run(sql`PRAGMA foreign_keys = ON`);

  return db;
};

/**
 * Seeds a test user and returns the user ID.
 */
export const seedTestUser = async (
  db: Database,
  overrides?: { id?: string; clerkId?: string; email?: string },
) => {
  const user = {
    id: overrides?.id ?? 'user_01',
    clerkId: overrides?.clerkId ?? 'clerk_test_123',
    email: overrides?.email ?? 'test@example.com',
  };

  await db.insert(schema.users).values(user);
  return user;
};

/**
 * Seeds a test session and returns the session record.
 */
export const seedTestSession = async (
  db: Database,
  userId: string,
  overrides?: Partial<typeof schema.swingSessions.$inferInsert>,
) => {
  const session = {
    id: overrides?.id ?? 'session_01',
    userId,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };

  await db.insert(schema.swingSessions).values(session);
  return session;
};
