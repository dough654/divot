import { StyleSheet, View, Text } from 'react-native';
import type { MotionSwingState } from '@/src/types/motion-detection';

type DetectionDebugOverlayProps = {
  /** Whether the overlay should be rendered. */
  visible: boolean;
  /** Debug info from useMotionSwingDetection. */
  debugInfo: {
    motionMagnitude: number;
    audioLevel: number;
    state: MotionSwingState;
    stillFrameCount: number;
    audioConfirmed: boolean;
    swingThreshold: number;
    stillnessThreshold: number;
  };
};

/** Map state to display label. */
const STATE_LABELS: Record<MotionSwingState, string> = {
  idle: 'Idle',
  watching: 'Watching',
  still: 'Still...',
  armed: 'Armed',
  detecting: 'Detecting...',
  swing: 'Swing!',
  cooldown: 'Cooldown',
};

/** Map state to color. */
const STATE_COLORS: Record<MotionSwingState, string> = {
  idle: '#888',
  watching: '#FFB800',
  still: '#00AAFF',
  armed: '#00FF88',
  detecting: '#FF6600',
  swing: '#FF0066',
  cooldown: '#AA66FF',
};

/**
 * Semi-transparent debug overlay showing motion detection state,
 * motion/audio levels, thresholds, and confirmation status.
 *
 * Uses `pointerEvents="none"` so it doesn't block touch events.
 */
export const DetectionDebugOverlay = ({ visible, debugInfo }: DetectionDebugOverlayProps) => {
  if (!visible) return null;

  const {
    motionMagnitude,
    audioLevel,
    state,
    stillFrameCount,
    audioConfirmed,
    swingThreshold,
    stillnessThreshold,
  } = debugInfo;

  const stateLabel = STATE_LABELS[state] ?? state;
  const stateColor = STATE_COLORS[state] ?? '#888';

  // Scale bars — cap at 0.2 for motion (most values are tiny), 1.0 for audio
  const motionBarWidth = Math.min(motionMagnitude / 0.15, 1) * 100;
  const audioBarWidth = Math.min(audioLevel, 1) * 100;
  const swingThresholdPosition = Math.min(swingThreshold / 0.15, 1) * 100;
  const stillThresholdPosition = Math.min(stillnessThreshold / 0.15, 1) * 100;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* State badge */}
      <View style={[styles.stateBadge, { borderColor: stateColor }]}>
        <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>
      </View>

      {/* Motion bar */}
      <View style={styles.barRow}>
        <Text style={styles.barLabel}>MOT</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${motionBarWidth}%`, backgroundColor: '#FFB800' }]} />
          {/* Swing threshold marker */}
          <View style={[styles.thresholdMarker, { left: `${swingThresholdPosition}%`, backgroundColor: '#FF6600' }]} />
          {/* Stillness threshold marker */}
          <View style={[styles.thresholdMarker, { left: `${stillThresholdPosition}%`, backgroundColor: '#00AAFF' }]} />
        </View>
        <Text style={styles.barValue}>{motionMagnitude.toFixed(4)}</Text>
      </View>

      {/* Audio bar */}
      <View style={styles.barRow}>
        <Text style={styles.barLabel}>AUD</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${audioBarWidth}%`, backgroundColor: '#00FF88' }]} />
        </View>
        <Text style={styles.barValue}>{audioLevel.toFixed(2)}</Text>
      </View>

      {/* Counters row */}
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
  stateBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
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
