import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, SessionMetadata, SessionLocation } from '@/src/types/session';

const METADATA_KEY = '@divot/sessions_metadata';
const CURRENT_VERSION = 1;

/**
 * Generates a unique session ID.
 */
const generateSessionId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
};

/**
 * Loads session metadata from AsyncStorage.
 */
const loadMetadata = async (): Promise<SessionMetadata> => {
  try {
    const data = await AsyncStorage.getItem(METADATA_KEY);
    if (data) {
      return JSON.parse(data) as SessionMetadata;
    }
  } catch (err) {
    console.error('Failed to load session metadata:', err);
  }
  return { sessions: [], version: CURRENT_VERSION, locationPermissionAsked: false };
};

/**
 * Saves session metadata to AsyncStorage.
 */
const saveMetadata = async (metadata: SessionMetadata): Promise<void> => {
  try {
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch (err) {
    console.error('Failed to save session metadata:', err);
    throw err;
  }
};

export type CreateSessionOptions = {
  role: 'camera' | 'viewer';
  location?: SessionLocation;
};

/**
 * Creates a new practice session and persists it.
 */
export const createSession = async (options: CreateSessionOptions): Promise<Session> => {
  const session: Session = {
    id: generateSessionId(),
    startedAt: Date.now(),
    endedAt: null,
    clipIds: [],
    role: options.role,
    location: options.location,
  };

  const metadata = await loadMetadata();
  metadata.sessions.unshift(session);
  await saveMetadata(metadata);

  return session;
};

/**
 * Ends a session by setting its endedAt timestamp.
 */
export const endSession = async (sessionId: string): Promise<void> => {
  const metadata = await loadMetadata();
  const session = metadata.sessions.find((s) => s.id === sessionId);
  if (session && session.endedAt === null) {
    session.endedAt = Date.now();
    await saveMetadata(metadata);
  }
};

/**
 * Appends a clip ID to a session's clipIds list.
 */
export const addClipToSession = async (sessionId: string, clipId: string): Promise<void> => {
  const metadata = await loadMetadata();
  const session = metadata.sessions.find((s) => s.id === sessionId);
  if (session && !session.clipIds.includes(clipId)) {
    session.clipIds.push(clipId);
    await saveMetadata(metadata);
  }
};

/**
 * Removes a clip ID from whichever session contains it.
 * Called when a clip is deleted.
 */
export const removeClipFromSession = async (clipId: string): Promise<void> => {
  const metadata = await loadMetadata();
  let changed = false;

  for (const session of metadata.sessions) {
    const index = session.clipIds.indexOf(clipId);
    if (index !== -1) {
      session.clipIds.splice(index, 1);
      changed = true;
      break;
    }
  }

  if (changed) {
    await saveMetadata(metadata);
  }
};

/**
 * Returns all sessions, newest first.
 */
export const listSessions = async (): Promise<Session[]> => {
  const metadata = await loadMetadata();
  return metadata.sessions;
};

/**
 * Gets a single session by ID.
 */
export const getSession = async (sessionId: string): Promise<Session | null> => {
  const metadata = await loadMetadata();
  return metadata.sessions.find((s) => s.id === sessionId) ?? null;
};

/**
 * Updates the notes field on a session.
 */
export const updateSessionNotes = async (sessionId: string, notes: string): Promise<void> => {
  const metadata = await loadMetadata();
  const session = metadata.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.notes = notes;
    await saveMetadata(metadata);
  }
};

/**
 * Updates arbitrary fields on a session.
 */
export const updateSession = async (
  sessionId: string,
  fields: Partial<Pick<Session, 'notes' | 'cloudSessionId'>>,
): Promise<Session | null> => {
  const metadata = await loadMetadata();
  const session = metadata.sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  Object.assign(session, fields);
  await saveMetadata(metadata);
  return session;
};

/**
 * Deletes a session. Does NOT delete associated clips — they become unsorted.
 */
export const deleteSession = async (sessionId: string): Promise<boolean> => {
  const metadata = await loadMetadata();
  const index = metadata.sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return false;

  metadata.sessions.splice(index, 1);
  await saveMetadata(metadata);
  return true;
};

/**
 * Marks that we've asked the user for location permission (one-time flag).
 */
export const setLocationPermissionAsked = async (): Promise<void> => {
  const metadata = await loadMetadata();
  metadata.locationPermissionAsked = true;
  await saveMetadata(metadata);
};

/**
 * Returns whether we've already asked the user for location permission.
 */
export const hasAskedLocationPermission = async (): Promise<boolean> => {
  const metadata = await loadMetadata();
  return metadata.locationPermissionAsked;
};
