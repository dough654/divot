import { StyleSheet, View, Text, AccessibilityInfo } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ConnectionStep, ConnectionQuality } from '@/src/types';
import { formatQuality, getQualityRating, useHaptics } from '@/src/hooks';

export type ConnectionStatusProps = {
  step: ConnectionStep;
  quality?: ConnectionQuality | null;
  isDark?: boolean;
  /** Compact mode for tighter layouts */
  compact?: boolean;
};

const stepInfo: Record<ConnectionStep, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  idle: { label: 'Ready to connect', icon: 'radio-button-off' },
  'generating-session': { label: 'Generating session...', icon: 'sync' },
  'displaying-qr': { label: 'Waiting for scan...', icon: 'qr-code' },
  'scanning-qr': { label: 'Scanning QR code...', icon: 'scan' },
  'discovering-local': { label: 'Searching local network...', icon: 'wifi' },
  'local-discovery-failed': { label: 'Local discovery failed', icon: 'wifi-outline' },
  'setting-up-hotspot': { label: 'Setting up hotspot...', icon: 'phone-portrait' },
  'connecting-to-hotspot': { label: 'Connecting to hotspot...', icon: 'cellular' },
  'exchanging-signaling': { label: 'Exchanging signals...', icon: 'swap-horizontal' },
  'establishing-webrtc': { label: 'Establishing connection...', icon: 'git-branch' },
  connected: { label: 'Connected', icon: 'checkmark-circle' },
  reconnecting: { label: 'Reconnecting...', icon: 'refresh' },
  'reconnect-failed': { label: 'Reconnection failed', icon: 'close-circle' },
  failed: { label: 'Connection failed', icon: 'close-circle' },
};

const qualityColors: Record<ReturnType<typeof getQualityRating>, string> = {
  excellent: '#4CAF50',
  good: '#8BC34A',
  fair: '#FF9800',
  poor: '#f44336',
  unknown: '#888',
};

/**
 * Returns an appropriate announcement message for screen readers based on connection step.
 * Returns null for steps that don't need explicit announcement.
 */
const getStepAnnouncement = (step: ConnectionStep, label: string): string | null => {
  switch (step) {
    case 'connected':
      return 'Connected successfully';
    case 'reconnecting':
      return 'Connection lost. Attempting to reconnect.';
    case 'reconnect-failed':
      return 'Reconnection failed. Please try again.';
    case 'failed':
      return 'Connection failed. Please try again.';
    case 'local-discovery-failed':
      return 'Could not find device on local network.';
    default:
      // For other transitional states, use the label
      return label;
  }
};

/**
 * Displays the current connection status with visual indicators.
 * Announces state changes to screen readers via AccessibilityInfo.
 */
export const ConnectionStatus = ({
  step,
  quality,
  isDark = false,
  compact = false,
}: ConnectionStatusProps) => {
  const info = stepInfo[step];
  const isConnected = step === 'connected';
  const isFailed = step === 'failed' || step === 'reconnect-failed';
  const isReconnecting = step === 'reconnecting';
  const qualityRating = getQualityRating(quality ?? null);
  const haptics = useHaptics();

  // Track previous values for change detection
  const prevStepRef = useRef<ConnectionStep | null>(null);
  const prevQualityRatingRef = useRef<ReturnType<typeof getQualityRating> | null>(null);

  // Announce connection state changes and provide haptic feedback
  useEffect(() => {
    // Skip initial mount
    if (prevStepRef.current === null) {
      prevStepRef.current = step;
      return;
    }

    // Only react if step actually changed
    if (prevStepRef.current !== step) {
      // Accessibility announcement
      const announcement = getStepAnnouncement(step, info.label);
      if (announcement) {
        AccessibilityInfo.announceForAccessibility(announcement);
      }

      // Haptic feedback based on new state
      if (step === 'connected') {
        haptics.success();
      } else if (step === 'failed' || step === 'reconnect-failed') {
        haptics.error();
      }

      prevStepRef.current = step;
    }
  }, [step, info.label, haptics]);

  // Announce quality degradation
  useEffect(() => {
    if (!isConnected || !quality) return;

    // Skip initial quality reading
    if (prevQualityRatingRef.current === null) {
      prevQualityRatingRef.current = qualityRating;
      return;
    }

    // Announce if quality degraded to poor
    if (
      prevQualityRatingRef.current !== 'poor' &&
      qualityRating === 'poor'
    ) {
      AccessibilityInfo.announceForAccessibility(
        'Warning: Connection quality is poor. You may experience lag or disconnection.'
      );
    }

    prevQualityRatingRef.current = qualityRating;
  }, [isConnected, quality, qualityRating]);

  const getStatusColor = () => {
    if (isConnected) return '#4CAF50';
    if (isReconnecting) return '#FF9800';
    if (isFailed) return '#f44336';
    return isDark ? '#888' : '#666';
  };

  if (compact) {
    return (
      <View
        style={[styles.compactContainer, isDark && styles.compactContainerDark]}
        accessible
        accessibilityLabel={`Connection status: ${info.label}${isConnected && quality ? `, latency ${quality.latencyMs} milliseconds` : ''}`}
        accessibilityLiveRegion="polite"
      >
        <Ionicons
          name={info.icon}
          size={16}
          color={getStatusColor()}
        />
        <Text style={[styles.compactLabel, isDark && styles.compactLabelDark, isConnected && styles.labelConnected]}>
          {info.label}
        </Text>
        {isConnected && quality && (
          <>
            <View
              style={[
                styles.qualityDot,
                { backgroundColor: qualityColors[qualityRating] },
              ]}
            />
            <Text style={[styles.compactQuality, isDark && styles.qualityTextDark]}>
              {quality.latencyMs}ms
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, isDark && styles.containerDark]}
      accessible
      accessibilityLabel={`Connection status: ${info.label}${isConnected && quality ? `. Quality: ${formatQuality(quality)}` : ''}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.statusRow}>
        <Ionicons
          name={info.icon}
          size={20}
          color={getStatusColor()}
        />
        <Text style={[styles.label, isDark && styles.labelDark, isConnected && styles.labelConnected]}>
          {info.label}
        </Text>
      </View>

      {isConnected && quality && (
        <View style={styles.qualityRow}>
          <View
            style={[
              styles.qualityDot,
              { backgroundColor: qualityColors[qualityRating] },
            ]}
          />
          <Text style={[styles.qualityText, isDark && styles.qualityTextDark]}>
            {formatQuality(quality)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  containerDark: {
    backgroundColor: '#2a2a4e',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactContainerDark: {},
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  labelDark: {
    color: '#888',
  },
  compactLabel: {
    fontSize: 13,
    color: '#666',
  },
  compactLabelDark: {
    color: '#888',
  },
  labelConnected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  qualityText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'SpaceMono',
  },
  qualityTextDark: {
    color: '#888',
  },
  compactQuality: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'SpaceMono',
  },
});
