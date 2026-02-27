import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, seedTestUser, seedTestSession } from '../helpers/test-db';
import { createTestApp } from '../helpers/test-app';
import type { Database } from '../../src/db';
import type { R2Service } from '../../src/routes/presigned-urls';

const USER_ID = 'user_01';
const OTHER_USER_ID = 'user_02';
const SESSION_ID = 'session_01';

const createMockR2 = (): R2Service => ({
  generateUploadUrl: vi.fn().mockResolvedValue({
    url: 'https://fake-r2.example.com/upload?signed=abc',
    expiresIn: 900,
  }),
  generateDownloadUrl: vi.fn().mockResolvedValue({
    url: 'https://fake-r2.example.com/download?signed=xyz',
    expiresIn: 3600,
  }),
});

const seedTestClip = async (
  db: Database,
  overrides?: { id?: string; sessionId?: string; storageKey?: string | null; thumbnailKey?: string | null },
) => {
  const clip = {
    id: overrides?.id ?? 'clip_01',
    sessionId: overrides?.sessionId ?? SESSION_ID,
    storageKey: overrides?.storageKey ?? null,
    thumbnailKey: overrides?.thumbnailKey ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { clips } = await import('../../src/db/schema');
  await db.insert(clips).values(clip);
  return clip;
};

describe('presigned URLs', () => {
  let db: Database;
  let mockR2: R2Service;

  beforeEach(async () => {
    db = await createTestDb();
    await seedTestUser(db, { id: USER_ID });
    await seedTestUser(db, { id: OTHER_USER_ID, clerkId: 'clerk_other', email: 'other@test.com' });
    await seedTestSession(db, USER_ID, { id: SESSION_ID });
    mockR2 = createMockR2();
  });

  describe('POST /api/presigned-urls/upload', () => {
    it('returns a presigned upload URL and storage key for an owned clip', async () => {
      await seedTestClip(db, { id: 'clip_01' });
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01', contentType: 'video/mp4' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.url).toContain('https://');
      expect(json.data.storageKey).toBe(`users/${USER_ID}/clips/clip_01/video.mp4`);
      expect(json.data.expiresIn).toBe(900);
    });

    it('generates thumbnail key when type is thumbnail', async () => {
      await seedTestClip(db, { id: 'clip_01' });
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01', contentType: 'image/jpeg', type: 'thumbnail' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.storageKey).toBe(`users/${USER_ID}/clips/clip_01/thumbnail.jpg`);
    });

    it('returns 404 for a non-existent clip', async () => {
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'nonexistent', contentType: 'video/mp4' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 404 for another user\'s clip', async () => {
      await seedTestClip(db, { id: 'clip_01' });
      const app = createTestApp(db, OTHER_USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01', contentType: 'video/mp4' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 when clipId is missing', async () => {
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'video/mp4' }),
      });

      expect(res.status).toBe(400);
    });

    it('returns 503 when R2 is not configured', async () => {
      await seedTestClip(db, { id: 'clip_01' });
      const app = createTestApp(db, USER_ID, null);

      const res = await app.request('/api/presigned-urls/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01', contentType: 'video/mp4' }),
      });

      expect(res.status).toBe(503);
    });
  });

  describe('POST /api/presigned-urls/download', () => {
    it('returns a presigned download URL when storageKey exists', async () => {
      await seedTestClip(db, { id: 'clip_01', storageKey: 'users/user_01/clips/clip_01/video.mp4' });
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.url).toContain('https://');
      expect(json.data.expiresIn).toBe(3600);
    });

    it('returns download URL for thumbnail when type is thumbnail', async () => {
      await seedTestClip(db, { id: 'clip_01', thumbnailKey: 'users/user_01/clips/clip_01/thumbnail.jpg' });
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01', type: 'thumbnail' }),
      });

      expect(res.status).toBe(200);
    });

    it('returns 404 when no file has been uploaded', async () => {
      await seedTestClip(db, { id: 'clip_01', storageKey: null });
      const app = createTestApp(db, USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01' }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('No video uploaded');
    });

    it('returns 404 for another user\'s clip', async () => {
      await seedTestClip(db, { id: 'clip_01', storageKey: 'some/key.mp4' });
      const app = createTestApp(db, OTHER_USER_ID, mockR2);

      const res = await app.request('/api/presigned-urls/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 503 when R2 is not configured', async () => {
      await seedTestClip(db, { id: 'clip_01', storageKey: 'some/key.mp4' });
      const app = createTestApp(db, USER_ID, null);

      const res = await app.request('/api/presigned-urls/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: 'clip_01' }),
      });

      expect(res.status).toBe(503);
    });
  });
});
