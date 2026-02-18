import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser } from '../helpers/test-db';
import { createTestApp } from '../helpers/test-app';
import type { Database } from '../../src/db';

let db: Database;
let app: ReturnType<typeof createTestApp>;
const USER_ID = 'user_01';

beforeEach(async () => {
  db = await createTestDb();
  await seedTestUser(db, { id: USER_ID });
  app = createTestApp(db, USER_ID);
});

describe('PUT /api/settings/:key', () => {
  it('creates a new setting', async () => {
    const res = await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"dark"' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.key).toBe('theme');
    expect(json.data.value).toBe('"dark"');
  });

  it('upserts an existing setting', async () => {
    await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"dark"' }),
    });

    const res = await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"light"' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.value).toBe('"light"');
  });

  it('rejects missing value', async () => {
    const res = await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/settings', () => {
  it('returns all settings for user', async () => {
    await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"dark"' }),
    });
    await app.request('/api/settings/units', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"yards"' }),
    });

    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(2);
  });

  it('returns empty array when no settings', async () => {
    const res = await app.request('/api/settings');
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

describe('DELETE /api/settings/:key', () => {
  it('deletes a setting', async () => {
    await app.request('/api/settings/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"dark"' }),
    });

    const res = await app.request('/api/settings/theme', { method: 'DELETE' });
    expect(res.status).toBe(200);

    const check = await app.request('/api/settings');
    const json = await check.json();
    expect(json.data).toHaveLength(0);
  });

  it('returns 404 for non-existent setting', async () => {
    const res = await app.request('/api/settings/nope', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('key validation', () => {
  it('rejects keys with special characters', async () => {
    const res = await app.request('/api/settings/bad key!', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '"test"' }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts alphanumeric keys with dots and dashes', async () => {
    const res = await app.request('/api/settings/video.recording-fps', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: '240' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('ownership isolation', () => {
  it('user A cannot see user B settings', async () => {
    // Create userB and their setting directly in DB
    const userB = await seedTestUser(db, { id: 'user_b', clerkId: 'clerk_b', email: 'b@test.com' });
    const { userSettings } = await import('../../src/db/schema');
    const { ulid } = await import('ulidx');
    await db.insert(userSettings).values({
      id: ulid(),
      userId: userB.id,
      key: 'secret',
      value: '"hidden"',
    });

    // Authenticated as USER_ID — should not see user_b's setting
    const res = await app.request('/api/settings');
    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });
});
