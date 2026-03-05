/**
 * Ensures local sessions have corresponding cloud records before uploading clips.
 *
 * - `ensureCloudSession`: maps a local session to a cloud session, creating if needed.
 * - `ensureUnsortedSession`: creates/caches a synthetic "Unsorted Clips" session for clips
 *   that don't belong to any local session (cloud clips.sessionId is NOT NULL).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiClient } from './api-client';
import type { Session } from '@/src/types/session';
import { updateSession } from '@/src/services/session/session-storage';

const UNSORTED_SESSION_KEY = '@divot/unsorted_session_id';

/** In-memory cache for the unsorted session ID (one per app launch). */
let cachedUnsortedSessionId: string | null = null;

/**
 * Ensures a local session has a corresponding cloud session.
 * Returns the cloud session ID.
 */
export const ensureCloudSession = async (
  apiClient: ApiClient,
  localSession: Session,
): Promise<string> => {
  // Already synced
  if (localSession.cloudSessionId) {
    return localSession.cloudSessionId;
  }

  const cloudSession = await apiClient.createSession({
    recordedAt: new Date(localSession.startedAt).toISOString(),
    endedAt: localSession.endedAt ? new Date(localSession.endedAt).toISOString() : null,
    notes: localSession.notes ?? null,
    locationDisplayName: localSession.location?.displayName ?? null,
    latitude: localSession.location?.latitude ?? null,
    longitude: localSession.location?.longitude ?? null,
  });

  // Persist the cloud ID on the local session
  await updateSession(localSession.id, { cloudSessionId: cloudSession.id });

  return cloudSession.id;
};

/**
 * Ensures a synthetic "Unsorted Clips" session exists in the cloud.
 * Used for clips that don't belong to any local session.
 * Cached per app launch and persisted in AsyncStorage.
 */
export const ensureUnsortedSession = async (apiClient: ApiClient): Promise<string> => {
  // Check in-memory cache first
  if (cachedUnsortedSessionId) {
    return cachedUnsortedSessionId;
  }

  // Check AsyncStorage
  const stored = await AsyncStorage.getItem(UNSORTED_SESSION_KEY);
  if (stored) {
    cachedUnsortedSessionId = stored;
    return stored;
  }

  // Create a new synthetic session in the cloud
  const cloudSession = await apiClient.createSession({
    recordedAt: new Date().toISOString(),
    notes: 'Unsorted Clips',
  });

  cachedUnsortedSessionId = cloudSession.id;
  await AsyncStorage.setItem(UNSORTED_SESSION_KEY, cloudSession.id);

  return cloudSession.id;
};
