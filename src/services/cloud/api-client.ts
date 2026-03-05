/**
 * Authenticated HTTP client for the Divot cloud API.
 *
 * Wraps fetch with Clerk auth tokens and typed methods for
 * sessions, clips, presigned URLs, and storage usage.
 */

import Constants from 'expo-constants';

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'https://divot-api.fly.dev';

type TokenGetter = () => Promise<string | null>;

type CloudSession = {
  id: string;
  userId: string;
  recordedAt: string;
  endedAt: string | null;
  notes: string | null;
  locationDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
};

type CloudClip = {
  id: string;
  sessionId: string;
  storageKey: string | null;
  fileSize: number | null;
  durationSeconds: number | null;
  fps: number | null;
  clipOrder: number | null;
  name: string | null;
  cameraAngle: string | null;
  createdAt: string;
  updatedAt: string;
};

type StorageUsage = {
  usedBytes: number;
  quotaBytes: number;
  clipCount: number;
};

type UploadUrlResponse = {
  url: string;
  storageKey: string;
  expiresIn: number;
};

type CreateSessionParams = {
  recordedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  locationDisplayName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type CreateClipParams = {
  sessionId: string;
  fileSize?: number | null;
  durationSeconds?: number | null;
  fps?: number | null;
  clipOrder?: number | null;
  name?: string | null;
  cameraAngle?: string | null;
};

type UpdateClipParams = {
  storageKey?: string | null;
  name?: string | null;
};

/**
 * Makes an authenticated request to the Divot API.
 * Throws on non-2xx responses.
 */
const request = async <T>(
  getToken: TokenGetter,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
};

/** Creates an API client bound to a token getter function. */
export const createApiClient = (getToken: TokenGetter) => ({
  /** GET /api/storage/usage */
  getStorageUsage: () =>
    request<{ data: StorageUsage }>(getToken, 'GET', '/api/storage/usage')
      .then((r) => r.data),

  /** POST /api/sessions */
  createSession: (params: CreateSessionParams) =>
    request<{ data: CloudSession }>(getToken, 'POST', '/api/sessions', params)
      .then((r) => r.data),

  /** POST /api/clips */
  createClip: (params: CreateClipParams) =>
    request<{ data: CloudClip }>(getToken, 'POST', '/api/clips', params)
      .then((r) => r.data),

  /** PATCH /api/clips/:id */
  updateClip: (clipId: string, params: UpdateClipParams) =>
    request<{ data: CloudClip }>(getToken, 'PATCH', `/api/clips/${clipId}`, params)
      .then((r) => r.data),

  /** POST /api/presigned-urls/upload */
  getUploadUrl: (clipId: string, contentType = 'video/mp4') =>
    request<{ data: UploadUrlResponse }>(getToken, 'POST', '/api/presigned-urls/upload', {
      clipId,
      contentType,
      type: 'video',
    }).then((r) => r.data),
});

export type ApiClient = ReturnType<typeof createApiClient>;
