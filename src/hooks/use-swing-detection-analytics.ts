/**
 * Analytics hook for swing detection telemetry.
 *
 * Watches state machine transitions from the classifier hook and fires
 * PostHog events for swing detection, completion, cancellation, and
 * per-session summaries.
 *
 * Import directly:
 *   import { useSwingDetectionAnalytics } from '@/src/hooks/use-swing-detection-analytics';
 */

import { useEffect, useRef } from 'react';
import { trackEvent } from '@/src/services/analytics';
import type { SwingAnalyticsSnapshot } from '@/src/types/swing-classifier';

/** Rounds a number to 4 decimal places to avoid float noise in PostHog. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

type SessionAccumulators = {
  sessionStartMs: number;
  totalFrames: number;
  addressEntryCount: number;
  addressCancellationCount: number;
  swingCount: number;
  rotationTimeoutCount: number;
  peakBackswingDeltas: number[];
  swingDurations: number[];
};

const freshAccumulators = (): SessionAccumulators => ({
  sessionStartMs: Date.now(),
  totalFrames: 0,
  addressEntryCount: 0,
  addressCancellationCount: 0,
  swingCount: 0,
  rotationTimeoutCount: 0,
  peakBackswingDeltas: [],
  swingDurations: [],
});

type UseSwingDetectionAnalyticsOptions = {
  /** Whether the classifier is active. */
  enabled: boolean;
  /** Snapshot from the classifier hook (null when no transition this frame). */
  analyticsSnapshot: SwingAnalyticsSnapshot | null;
};

/**
 * Observes swing classifier state transitions and fires analytics events:
 *
 * - `swing_detected` — address → swinging
 * - `swing_completed` — swinging → idle
 * - `swing_address_cancelled` — address → idle (no swing)
 * - `swing_session_summary` — when classifier is disabled (end of session)
 */
export const useSwingDetectionAnalytics = ({
  enabled,
  analyticsSnapshot,
}: UseSwingDetectionAnalyticsOptions): void => {
  const accRef = useRef<SessionAccumulators>(freshAccumulators());
  const swingIndexRef = useRef(0);
  const addressEntryIndexRef = useRef(0);
  const wasEnabledRef = useRef(false);

  // Fire session summary when classifier is disabled
  useEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      // Starting a new session — reset accumulators
      accRef.current = freshAccumulators();
      swingIndexRef.current = 0;
      addressEntryIndexRef.current = 0;
    }

    if (!enabled && wasEnabledRef.current) {
      // Ending session — fire summary
      const acc = accRef.current;
      const sessionDurationMs = Date.now() - acc.sessionStartMs;

      if (acc.totalFrames > 0) {
        const avgPeakBackswingDelta = acc.peakBackswingDeltas.length > 0
          ? round4(acc.peakBackswingDeltas.reduce((a, b) => a + b, 0) / acc.peakBackswingDeltas.length)
          : 0;
        const minPeakBackswingDelta = acc.peakBackswingDeltas.length > 0
          ? round4(Math.min(...acc.peakBackswingDeltas))
          : 0;
        const avgSwingDurationMs = acc.swingDurations.length > 0
          ? Math.round(acc.swingDurations.reduce((a, b) => a + b, 0) / acc.swingDurations.length)
          : 0;

        trackEvent('swing_session_summary', {
          sessionDurationMs,
          totalFrames: acc.totalFrames,
          addressEntryCount: acc.addressEntryCount,
          addressCancellationCount: acc.addressCancellationCount,
          swingCount: acc.swingCount,
          rotationTimeoutCount: acc.rotationTimeoutCount,
          avgPeakBackswingDelta,
          minPeakBackswingDelta,
          avgSwingDurationMs,
          detectionRate: acc.addressEntryCount > 0
            ? round4(acc.swingCount / acc.addressEntryCount)
            : 0,
        });
      }
    }

    wasEnabledRef.current = enabled;
  }, [enabled]);

  // Handle each transition snapshot
  useEffect(() => {
    if (!enabled || !analyticsSnapshot) return;

    const acc = accRef.current;
    acc.totalFrames = analyticsSnapshot.frameCount;
    const rotState = analyticsSnapshot.rotationState;

    switch (analyticsSnapshot.transition) {
      case 'idle_to_address': {
        acc.addressEntryCount += 1;
        addressEntryIndexRef.current += 1;
        break;
      }

      case 'address_to_swinging': {
        acc.swingCount += 1;
        swingIndexRef.current += 1;

        const peakBackswingDelta = rotState ? round4(rotState.peakAbsDelta) : 0;
        if (peakBackswingDelta > 0) {
          acc.peakBackswingDeltas.push(peakBackswingDelta);
        }

        trackEvent('swing_detected', {
          peakBackswingDelta,
          followThroughDelta: rotState ? round4(rotState.followThroughDelta) : 0,
          baselineDiff: rotState ? round4(rotState.baselineDiff) : 0,
          backswingSign: rotState?.backswingSign ?? 0,
          rotationDurationMs: rotState?.backswingTimestamp
            ? analyticsSnapshot.timestamp - rotState.backswingTimestamp
            : 0,
          framesInAddress: analyticsSnapshot.framesInPreviousState,
          cnnPhase: analyticsSnapshot.cnnPhase,
          cnnConfidence: round4(analyticsSnapshot.cnnConfidence),
          swingIndex: swingIndexRef.current,
        });
        break;
      }

      case 'swinging_to_idle': {
        const durationMs = analyticsSnapshot.swingDurationMs ?? 0;
        if (durationMs > 0) {
          acc.swingDurations.push(durationMs);
        }

        trackEvent('swing_completed', {
          durationMs,
          exitReason: analyticsSnapshot.swingExitReason ?? 'unknown',
          swingIndex: swingIndexRef.current,
        });
        break;
      }

      case 'address_to_idle': {
        acc.addressCancellationCount += 1;

        // Check if this was a rotation timeout (backswing detected but no follow-through)
        if (rotState?.backswingDetected && !rotState.followThroughDetected) {
          acc.rotationTimeoutCount += 1;
        }

        trackEvent('swing_address_cancelled', {
          framesInAddress: analyticsSnapshot.framesInPreviousState,
          backswingDetected: rotState?.backswingDetected ?? false,
          peakDelta: rotState ? round4(rotState.peakAbsDelta) : 0,
          addressEntryIndex: addressEntryIndexRef.current,
        });
        break;
      }
    }
  }, [enabled, analyticsSnapshot]);
};
