import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTestUser, seedTestSession } from '../helpers/test-db';
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

describe('POST /api/sessions', () => {
  it('creates a session', async () => {
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordedAt: '2026-01-15T10:00:00Z' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.recordedAt).toBe('2026-01-15T10:00:00Z');
    expect(json.data.userId).toBe(USER_ID);
    expect(json.data.id).toBeTruthy();
  });

  it('rejects invalid body', async () => {
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/sessions', () => {
  it('returns user sessions ordered by recordedAt desc', async () => {
    await seedTestSession(db, USER_ID, { id: 'sess_a', recordedAt: '2026-01-01T00:00:00Z' });
    await seedTestSession(db, USER_ID, { id: 'sess_b', recordedAt: '2026-01-02T00:00:00Z' });

    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe('sess_b');
    expect(json.data[1].id).toBe('sess_a');
    expect(json.total).toBe(2);
  });

  it('supports pagination', async () => {
    await seedTestSession(db, USER_ID, { id: 'sess_a', recordedAt: '2026-01-01T00:00:00Z' });
    await seedTestSession(db, USER_ID, { id: 'sess_b', recordedAt: '2026-01-02T00:00:00Z' });

    const res = await app.request('/api/sessions?limit=1&offset=0');
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe('sess_b');
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session with clips', async () => {
    await seedTestSession(db, USER_ID, { id: 'sess_1' });

    const res = await app.request('/api/sessions/sess_1');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe('sess_1');
    expect(json.data.clips).toEqual([]);
  });

  it('returns 404 for non-existent session', async () => {
    const res = await app.request('/api/sessions/nope');
    expect(res.status).toBe(404);
  });
});

describe('ownership enforcement', () => {
  it('user A cannot access user B session', async () => {
    const userB = await seedTestUser(db, { id: 'user_b', clerkId: 'clerk_b', email: 'b@test.com' });
    await seedTestSession(db, userB.id, { id: 'sess_b' });

    // app is authenticated as USER_ID (user_01), not user_b
    const res = await app.request('/api/sessions/sess_b');
    expect(res.status).toBe(404);
  });

  it('user A cannot delete user B session', async () => {
    const userB = await seedTestUser(db, { id: 'user_b', clerkId: 'clerk_b', email: 'b@test.com' });
    await seedTestSession(db, userB.id, { id: 'sess_b' });

    const res = await app.request('/api/sessions/sess_b', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/sessions/:id', () => {
  it('updates session fields', async () => {
    await seedTestSession(db, USER_ID, { id: 'sess_1' });

    const res = await app.request('/api/sessions/sess_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Great session', clubType: '7-iron' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.notes).toBe('Great session');
    expect(json.data.clubType).toBe('7-iron');
  });
});

describe('DELETE /api/sessions/:id', () => {
  it('deletes session', async () => {
    await seedTestSession(db, USER_ID, { id: 'sess_1' });

    const res = await app.request('/api/sessions/sess_1', { method: 'DELETE' });
    expect(res.status).toBe(200);

    const check = await app.request('/api/sessions/sess_1');
    expect(check.status).toBe(404);
  });
});
