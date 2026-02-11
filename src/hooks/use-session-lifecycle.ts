import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@/src/types/session';
import { createSession, endSession, addClipToSession } from '@/src/services/session/session-storage';
import { getSessionLocation } from '@/src/utils/session-location';

export type UseSessionLifecycleOptions = {
  /** Whether the session should be active (e.g. camera screen is mounted). */
  isActive: boolean;
  /** Which role this device is playing. */
  role: 'camera' | 'viewer';
};

export type UseSessionLifecycleReturn = {
  /** The currently active session, or null if not in a session. */
  activeSession: Session | null;
  /** Tags a clip with the active session. Returns true if tagged. */
  tagClip: (clipId: string) => Promise<boolean>;
  /** Manually ends the current session. */
  endCurrentSession: () => Promise<void>;
};

/**
 * Manages session lifecycle: auto-creates a session when isActive becomes true,
 * ends it when isActive becomes false or on unmount.
 * Uses refs to avoid stale closures in async callbacks.
 */
export const useSessionLifecycle = ({
  isActive,
  role,
}: UseSessionLifecycleOptions): UseSessionLifecycleReturn => {
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const activeSessionRef = useRef<Session | null>(null);
  const isCreatingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // Create session when active
  useEffect(() => {
    if (isActive && !activeSessionRef.current && !isCreatingRef.current) {
      isCreatingRef.current = true;

      const start = async () => {
        try {
          const location = await getSessionLocation();
          const session = await createSession({ role, location });
          setActiveSession(session);
        } catch (err) {
          console.error('Failed to create session:', err);
        } finally {
          isCreatingRef.current = false;
        }
      };

      start();
    }
  }, [isActive, role]);

  // End session when deactivated
  useEffect(() => {
    if (!isActive && activeSessionRef.current) {
      const sessionId = activeSessionRef.current.id;
      setActiveSession(null);
      endSession(sessionId).catch((err) => {
        console.error('Failed to end session:', err);
      });
    }
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeSessionRef.current) {
        endSession(activeSessionRef.current.id).catch((err) => {
          console.error('Failed to end session on unmount:', err);
        });
      }
    };
  }, []);

  const tagClip = useCallback(async (clipId: string): Promise<boolean> => {
    const session = activeSessionRef.current;
    if (!session) return false;

    try {
      await addClipToSession(session.id, clipId);
      return true;
    } catch (err) {
      console.error('Failed to tag clip with session:', err);
      return false;
    }
  }, []);

  const endCurrentSession = useCallback(async (): Promise<void> => {
    const session = activeSessionRef.current;
    if (!session) return;

    setActiveSession(null);
    try {
      await endSession(session.id);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  }, []);

  return { activeSession, tagClip, endCurrentSession };
};
