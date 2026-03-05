/**
 * Simple event emitter for cloud upload lifecycle events.
 *
 * Components subscribe to know when background uploads
 * start, complete, or fail for a given clip.
 */

type UploadEventType = 'started' | 'completed' | 'failed' | 'quota_exceeded';

type UploadEventPayload = {
  clipId: string;
  error?: string;
};

type UploadEventListener = (payload: UploadEventPayload) => void;

const listeners = new Map<UploadEventType, Set<UploadEventListener>>();

/** Subscribe to an upload event type. Returns an unsubscribe function. */
export const onUploadEvent = (
  event: UploadEventType,
  listener: UploadEventListener,
): (() => void) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener);

  return () => {
    listeners.get(event)?.delete(listener);
  };
};

/** Emit an upload event to all registered listeners. */
export const emitUploadEvent = (
  event: UploadEventType,
  payload: UploadEventPayload,
): void => {
  const eventListeners = listeners.get(event);
  if (!eventListeners) return;

  for (const listener of eventListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error(`[UploadEvents] Listener error for ${event}:`, err);
    }
  }
};

/** Remove all listeners (for testing). */
export const clearAllUploadListeners = (): void => {
  listeners.clear();
};
