/**
 * Simple event emitter for analysis lifecycle events.
 *
 * Components subscribe to know when background pose analysis
 * starts, completes, or fails for a given clip.
 */

type AnalysisEventType = 'started' | 'progress' | 'completed' | 'failed';

type AnalysisEventPayload = {
  clipId: string;
  progress?: number;
  error?: string;
};

type AnalysisEventListener = (payload: AnalysisEventPayload) => void;

const listeners = new Map<AnalysisEventType, Set<AnalysisEventListener>>();

/** Subscribe to an analysis event type. Returns an unsubscribe function. */
export const onAnalysisEvent = (
  event: AnalysisEventType,
  listener: AnalysisEventListener,
): (() => void) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener);

  return () => {
    listeners.get(event)?.delete(listener);
  };
};

/** Emit an analysis event to all registered listeners. */
export const emitAnalysisEvent = (
  event: AnalysisEventType,
  payload: AnalysisEventPayload,
): void => {
  const eventListeners = listeners.get(event);
  if (!eventListeners) return;

  for (const listener of eventListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error(`[AnalysisEvents] Listener error for ${event}:`, err);
    }
  }
};

/** Remove all listeners (for testing). */
export const clearAllListeners = (): void => {
  listeners.clear();
};
