import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ConnectionStep, ConnectionQuality } from '@/src/types';
import { formatQuality, getQualityRating } from '@/src/hooks/use-connection-quality';

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
 * Displays the current connection status with visual indicators.
 */
export const ConnectionStatus = ({
  step,
  quality,
  isDark = false,
  compact = false,
}: ConnectionStatusProps) => {
  const info = stepInfo[step];
  const isConnected = step === 'connected';
  const isFailed = step === 'failed';
  const qualityRating = getQualityRating(quality ?? null);

  const getStatusColor = () => {
    if (isConnected) return '#4CAF50';
    if (isFailed) return '#f44336';
    return isDark ? '#888' : '#666';
  };

  if (compact) {
    return (
      <View style={[styles.compactContainer, isDark && styles.compactContainerDark]}>
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
    <View style={[styles.container, isDark && styles.containerDark]}>
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
