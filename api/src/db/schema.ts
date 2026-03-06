import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email'),
  ...timestamps,
});

// ─── Swing Sessions ──────────────────────────────────────────────────────────

export const swingSessions = sqliteTable(
  'swing_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recordedAt: text('recorded_at').notNull(),
    endedAt: text('ended_at'),
    durationSeconds: real('duration_seconds'),
    deviceInfo: text('device_info'),
    clubType: text('club_type'),
    notes: text('notes'),
    locationDisplayName: text('location_display_name'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    ...timestamps,
  },
  (table) => [
    index('swing_sessions_user_id_idx').on(table.userId),
    index('swing_sessions_user_recorded_idx').on(table.userId, table.recordedAt),
  ],
);

// ─── Clips ───────────────────────────────────────────────────────────────────

export const clips = sqliteTable(
  'clips',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => swingSessions.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key'),
    thumbnailKey: text('thumbnail_key'),
    fileSize: integer('file_size'),
    durationSeconds: real('duration_seconds'),
    fps: integer('fps'),
    clipOrder: integer('clip_order'),
    name: text('name'),
    cameraAngle: text('camera_angle'),
    ...timestamps,
  },
  (table) => [index('clips_session_id_idx').on(table.sessionId)],
);

// ─── User Settings ───────────────────────────────────────────────────────────

export const userSettings = sqliteTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('user_settings_user_key_idx').on(table.userId, table.key)],
);
