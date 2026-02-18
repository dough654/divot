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
  await seedTestSession(db, USER_ID, { id: 'sess_1' });
  app = createTestApp(db, USER_ID);
});

describe('POST /api/clips', () => {
  it('creates a clip', async () => {
    const res = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_1',
        durationSeconds: 3.5,
        fps: 240,
        clipOrder: 1,
        name: 'Swing 1',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.sessionId).toBe('sess_1');
    expect(json.data.name).toBe('Swing 1');
    expect(json.data.fps).toBe(240);
  });

  it('rejects clip for non-owned session', async () => {
    const userB = await seedTestUser(db, { id: 'user_b', clerkId: 'clerk_b', email: 'b@test.com' });
    await seedTestSession(db, userB.id, { id: 'sess_b' });

    const res = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_b', name: 'Sneaky' }),
    });

    expect(res.status).toBe(404);
  });

  it('rejects missing sessionId', async () => {
    const res = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No session' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/clips', () => {
  it('requires sessionId query param', async () => {
    const res = await app.request('/api/clips');
    expect(res.status).toBe(400);
  });

  it('returns clips for a session', async () => {
    // Create two clips
    await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_1', clipOrder: 1, name: 'Clip 1' }),
    });
    await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_1', clipOrder: 2, name: 'Clip 2' }),
    });

    const res = await app.request('/api/clips?sessionId=sess_1');
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(2);
  });
});

describe('GET /api/clips/:id', () => {
  it('returns a single clip', async () => {
    const createRes = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_1', name: 'Test clip' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/api/clips/${created.id}`);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.name).toBe('Test clip');
  });

  it('returns 404 for non-existent clip', async () => {
    const res = await app.request('/api/clips/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/clips/:id', () => {
  it('updates clip name', async () => {
    const createRes = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_1', name: 'Old name' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/api/clips/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New name' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('New name');
  });
});

describe('DELETE /api/clips/:id', () => {
  it('deletes a clip', async () => {
    const createRes = await app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess_1', name: 'Doomed' }),
    });
    const { data: created } = await createRes.json();

    const res = await app.request(`/api/clips/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);

    const check = await app.request(`/api/clips/${created.id}`);
    expect(check.status).toBe(404);
  });
});
