/**
 * Location data captured at session start.
 */
export type SessionLocation = {
  latitude: number;
  longitude: number;
  /** Reverse-geocoded display name, e.g. "Austin, TX". Null if geocoding failed. */
  displayName: string | null;
};

/**
 * A practice session, auto-created when camera connects to viewer.
 */
export type Session = {
  /** Unique identifier: "session-{base36timestamp}-{random6}" */
  id: string;
  /** Date.now() at session start (camera connects). */
  startedAt: number;
  /** Date.now() at session end (camera disconnects), or null while active. */
  endedAt: number | null;
  /** Clip IDs recorded during this session, ordered by recording time. */
  clipIds: string[];
  /** Optional user notes. */
  notes?: string;
  /** Optional location captured at session start. */
  location?: SessionLocation;
  /** Which role started the session. */
  role: 'camera' | 'viewer';
  /** Cloud session ID after syncing to the server. */
  cloudSessionId?: string;
};

/**
 * Top-level metadata stored in AsyncStorage for sessions.
 */
export type SessionMetadata = {
  sessions: Session[];
  /** Schema version for future migrations. */
  version: number;
  /** Whether we've already asked the user for location permission. */
  locationPermissionAsked: boolean;
};
