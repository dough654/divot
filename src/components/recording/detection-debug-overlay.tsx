import { StyleSheet, View, Text } from 'react-native';
import type { MotionSwingState } from '@/src/types/motion-detection';
import type { SwingPhase } from '@/src/types/swing-classifier';
import { SWING_PHASES } from '@/src/types/swing-classifier';

// ============================================
// MOTION MODE (legacy)
// ============================================

type MotionDebugInfo = {
  mode: 'motion';
  motionMagnitude: number;
  audioLevel: number;
  state: MotionSwingState;
  stillFrameCount: number;
  audioConfirmed: boolean;
  swingThreshold: number;
  stillnessThreshold: number;
};

// ============================================
// CLASSIFIER MODE (new)
// ============================================

type DetectionState = 'idle' | 'address' | 'swinging';

type ClassifierDebugInfo = {
  mode: 'classifier';
  phase: SwingPhase;
  confidence: number;
  probabilities: readonly number[];
  windowFill: number;
  inSwing: boolean;
  isModelTrained: boolean;
  detectionState: DetectionState;
  confirmCount: number;
  pendingState: DetectionState;
};

type DetectionDebugOverlayProps = {
  /** Whether the overlay should be rendered. */
  visible: boolean;
  /** Debug info — either from motion detection or classifier. */
  debugInfo: MotionDebugInfo | ClassifierDebugInfo;
};

// ============================================
// MOTION STATE LABELS
// ============================================

/** Map state to display label. */
const MOTION_STATE_LABELS: Record<MotionSwingState, string> = {
  idle: 'Idle',
  watching: 'Watching',
  still: 'Still...',
  armed: 'Armed',
  detecting: 'Detecting...',
  swing: 'Swing!',
  cooldown: 'Cooldown',
};

/** Map state to color. */
const MOTION_STATE_COLORS: Record<MotionSwingState, string> = {
  idle: '#888',
  watching: '#FFB800',
  still: '#00AAFF',
  armed: '#00FF88',
  detecting: '#FF6600',
  swing: '#FF0066',
  cooldown: '#AA66FF',
};

// ============================================
// CLASSIFIER PHASE LABELS
// ============================================

const PHASE_LABELS: Record<SwingPhase, string> = {
  idle: 'Idle',
  address: 'Address',
  backswing: 'Backswing',
  downswing: 'Downswing',
  impact: 'Impact!',
  follow_through: 'Follow-through',
  finish: 'Finish',
};

const PHASE_COLORS: Record<SwingPhase, string> = {
  idle: '#888',
  address: '#00FF88',
  backswing: '#00AAFF',
  downswing: '#FF6600',
  impact: '#FF0066',
  follow_through: '#AA66FF',
  finish: '#FFB800',
};

// ============================================
// DETECTION STATE LABELS / COLORS
// ============================================

const DETECTION_STATE_LABELS: Record<DetectionState, string> = {
  idle: 'IDLE',
  address: 'ADDRESS',
  swinging: 'SWINGING',
};

const DETECTION_STATE_COLORS: Record<DetectionState, string> = {
  idle: '#888',
  address: '#00FF88',
  swinging: '#FF0066',
};

/** Frames required to confirm each transition (must match use-swing-classifier). */
const CONFIRMATION_THRESHOLDS: Record<string, number> = {
  'idle→address': 5,
  'address→swinging': 2,
  'swinging→idle': 8,
  'address→idle': 10,
};

/** Get the confirmation threshold for the current transition. */
const getConfirmThreshold = (current: DetectionState, pending: DetectionState): number =>
  CONFIRMATION_THRESHOLDS[`${current}→${pending}`] ?? 5;

// ============================================
// CLASSIFIER OVERLAY
// ============================================

const ClassifierOverlay = ({ debugInfo }: { debugInfo: ClassifierDebugInfo }) => {
  const {
    phase, confidence, probabilities, windowFill, isModelTrained,
    detectionState, confirmCount, pendingState,
  } = debugInfo;

  const stateLabel = DETECTION_STATE_LABELS[detectionState];
  const stateColor = DETECTION_STATE_COLORS[detectionState];
  const isTransitioning = pendingState !== detectionState;
  const confirmThreshold = getConfirmThreshold(detectionState, pendingState);
  const confirmPct = Math.min(confirmCount / confirmThreshold, 1) * 100;

  const phaseLabel = PHASE_LABELS[phase] ?? phase;
  const phaseColor = PHASE_COLORS[phase] ?? '#888';
  const windowFillPct = (windowFill / 30) * 100;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Detection state badge — the primary signal */}
      <View style={[styles.detectionBadge, { borderColor: stateColor, backgroundColor: `${stateColor}22` }]}>
        <Text style={[styles.detectionText, { color: stateColor }]}>{stateLabel}</Text>
      </View>

      {/* Confirmation progress — only shown during transitions */}
      {isTransitioning && (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>
            → {DETECTION_STATE_LABELS[pendingState].toLowerCase()} {confirmCount}/{confirmThreshold}
          </Text>
          <View style={styles.confirmTrack}>
            <View style={[
              styles.confirmFill,
              { width: `${confirmPct}%`, backgroundColor: DETECTION_STATE_COLORS[pendingState] },
            ]} />
          </View>
        </View>
      )}

      {/* Separator */}
      <View style={styles.separator} />

      {/* CNN prediction — compact row */}
      <View style={styles.cnnRow}>
        <Text style={[styles.cnnPhase, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={styles.cnnConfidence}>{(confidence * 100).toFixed(0)}%</Text>
      </View>

      {/* Phase probability bars */}
      {SWING_PHASES.map((p, i) => {
        const prob = probabilities[i] ?? 0;
        const barWidth = Math.min(prob, 1) * 100;
        const isActive = p === phase;
        return (
          <View key={p} style={styles.probRow}>
            <Text style={[styles.probLabel, isActive && { color: PHASE_COLORS[p] }]}>
              {p.slice(0, 4).toUpperCase()}
            </Text>
            <View style={styles.probTrack}>
              <View style={[
                styles.probFill,
                { width: `${barWidth}%`, backgroundColor: isActive ? PHASE_COLORS[p] : '#555' },
              ]} />
            </View>
            <Text style={styles.probValue}>{(prob * 100).toFixed(0)}</Text>
          </View>
        );
      })}

      {/* Separator */}
      <View style={styles.separator} />

      {/* Window fill indicator */}
      <View style={styles.countersRow}>
        <Text style={styles.counterText}>buf: {windowFill}/30</Text>
        <View style={[styles.fillBar, { width: `${windowFillPct}%` }]} />
      </View>

      {/* Model warning badge */}
      {!isModelTrained && (
        <View style={styles.warningBadge}>
          <Text style={styles.warningText}>PLACEHOLDER WEIGHTS</Text>
        </View>
      )}
    </View>
  );
};

// ============================================
// MOTION OVERLAY (legacy)
// ============================================

const MotionOverlay = ({ debugInfo }: { debugInfo: MotionDebugInfo }) => {
  const {
    motionMagnitude,
    audioLevel,
    state,
    stillFrameCount,
    audioConfirmed,
    swingThreshold,
    stillnessThreshold,
  } = debugInfo;

  const stateLabel = MOTION_STATE_LABELS[state] ?? state;
  const stateColor = MOTION_STATE_COLORS[state] ?? '#888';

  const motionBarWidth = Math.min(motionMagnitude / 0.15, 1) * 100;
  const audioBarWidth = Math.min(audioLevel, 1) * 100;
  const swingThresholdPosition = Math.min(swingThreshold / 0.15, 1) * 100;
  const stillThresholdPosition = Math.min(stillnessThreshold / 0.15, 1) * 100;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={[styles.stateBadge, { borderColor: stateColor }]}>
        <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>
      </View>

      <View style={styles.barRow}>
        <Text style={styles.barLabel}>MOT</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${motionBarWidth}%`, backgroundColor: '#FFB800' }]} />
          <View style={[styles.thresholdMarker, { left: `${swingThresholdPosition}%`, backgroundColor: '#FF6600' }]} />
          <View style={[styles.thresholdMarker, { left: `${stillThresholdPosition}%`, backgroundColor: '#00AAFF' }]} />
        </View>
        <Text style={styles.barValue}>{motionMagnitude.toFixed(4)}</Text>
      </View>

      <View style={styles.barRow}>
        <Text style={styles.barLabel}>AUD</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${audioBarWidth}%`, backgroundColor: '#00FF88' }]} />
        </View>
        <Text style={styles.barValue}>{audioLevel.toFixed(2)}</Text>
      </View>

      <View style={styles.countersRow}>
        <Text style={styles.counterText}>still: {stillFrameCount}</Text>
        {audioConfirmed && (
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>IMPACT</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * Semi-transparent debug overlay showing detection state.
 *
 * Supports both the legacy motion detection mode and the new
 * classifier mode, selected by the `mode` field in debugInfo.
 *
 * Uses `pointerEvents="none"` so it doesn't block touch events.
 */
export const DetectionDebugOverlay = ({ visible, debugInfo }: DetectionDebugOverlayProps) => {
  if (!visible) return null;

  if (debugInfo.mode === 'classifier') {
    return <ClassifierOverlay debugInfo={debugInfo} />;
  }
  return <MotionOverlay debugInfo={debugInfo} />;
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 8,
    minWidth: 180,
    gap: 4,
  },

  // Detection state badge (large, prominent)
  detectionBadge: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  detectionText: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  // Confirmation progress row
  confirmRow: {
    gap: 2,
  },
  confirmLabel: {
    fontSize: 9,
    color: '#AAA',
    fontFamily: 'monospace',
  },
  confirmTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confirmFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 2,
  },

  // CNN prediction compact row
  cnnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cnnPhase: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  cnnConfidence: {
    fontSize: 10,
    color: '#AAA',
    fontFamily: 'monospace',
  },

  // Model warning badge
  warningBadge: {
    backgroundColor: '#FF6600',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#000',
    fontFamily: 'monospace',
  },

  // Motion overlay state badge (legacy)
  stateBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  // Shared bar styles
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#AAA',
    width: 28,
    fontFamily: 'monospace',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  thresholdMarker: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: '100%',
  },
  barValue: {
    fontSize: 9,
    color: '#888',
    width: 40,
    textAlign: 'right',
    fontFamily: 'monospace',
  },

  // Phase probability bars
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 10,
  },
  probLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: '#666',
    width: 28,
    fontFamily: 'monospace',
  },
  probTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  probFill: {
    height: '100%',
    borderRadius: 2,
  },
  probValue: {
    fontSize: 7,
    color: '#666',
    width: 20,
    textAlign: 'right',
    fontFamily: 'monospace',
  },

  // Buffer / counters
  countersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  counterText: {
    fontSize: 9,
    color: '#888',
    fontFamily: 'monospace',
  },
  fillBar: {
    height: 3,
    backgroundColor: '#00AAFF',
    borderRadius: 1.5,
  },

  // Motion overlay confirmed badge (legacy)
  confirmedBadge: {
    backgroundColor: '#00FF88',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  confirmedText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#000',
    fontFamily: 'monospace',
  },
});
