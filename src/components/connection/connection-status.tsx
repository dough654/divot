import { View, Text, AccessibilityInfo } from 'react-native';
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
  cancelAnimation,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles, formatQuality, getQualityRating, useHaptics } from '../../hooks';
import type { Theme } from '../../context';
import type { ConnectionStep, ConnectionQuality } from '@/src/types';

export type ConnectionStatusProps = {
  step: ConnectionStep;
  quality?: ConnectionQuality | null;
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

/** Steps that should show a spinning animation */
const spinningSteps: ConnectionStep[] = [
  'generating-session',
  'scanning-qr',
  'discovering-local',
  'setting-up-hotspot',
  'connecting-to-hotspot',
  'exchanging-signaling',
  'establishing-webrtc',
  'reconnecting',
];

/**
 * Returns an appropriate announcement message for screen readers based on connection step.
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
      return label;
  }
};

/**
 * Displays the current connection status with animated visual indicators.
 * Stark style: pill-shaped frosted glass with lowercase text.
 */
export const ConnectionStatus = ({
  step,
  quality,
  compact = false,
}: ConnectionStatusProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const info = stepInfo[step];
  const isConnected = step === 'connected';
  const isFailed = step === 'failed' || step === 'reconnect-failed';
  const isReconnecting = step === 'reconnecting';
  const isSpinning = spinningSteps.includes(step);
  const qualityRating = getQualityRating(quality ?? null);
  const haptics = useHaptics();

  // Quality colors
  const qualityColors: Record<ReturnType<typeof getQualityRating>, string> = {
    excellent: theme.colors.success,
    good: '#8BC34A',
    fair: theme.colors.warning,
    poor: theme.colors.error,
    unknown: theme.colors.textTertiary,
  };

  // Animation values
  const rotation = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const shakeX = useSharedValue(0);
  const bgFlash = useSharedValue(0);

  // Track previous values for change detection
  const prevStepRef = useRef<ConnectionStep | null>(null);
  const prevQualityRatingRef = useRef<ReturnType<typeof getQualityRating> | null>(null);

  // Spinning animation for connecting states
  useEffect(() => {
    if (isSpinning) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = withTiming(0, { duration: 200 });
    }
  }, [isSpinning, rotation]);

  // Success pulse animation
  useEffect(() => {
    if (isConnected && prevStepRef.current !== null && prevStepRef.current !== 'connected') {
      iconScale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 10, stiffness: 300 })
      );
    }
  }, [isConnected, iconScale]);

  // Failure shake animation
  useEffect(() => {
    if (isFailed && prevStepRef.current !== null && !['failed', 'reconnect-failed'].includes(prevStepRef.current)) {
      shakeX.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
      bgFlash.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 300 })
      );
    }
  }, [isFailed, shakeX, bgFlash]);

  // Announce connection state changes and provide haptic feedback
  useEffect(() => {
    if (prevStepRef.current === null) {
      prevStepRef.current = step;
      return;
    }

    if (prevStepRef.current !== step) {
      const announcement = getStepAnnouncement(step, info.label);
      if (announcement) {
        AccessibilityInfo.announceForAccessibility(announcement);
      }

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

    if (prevQualityRatingRef.current === null) {
      prevQualityRatingRef.current = qualityRating;
      return;
    }

    if (prevQualityRatingRef.current !== 'poor' && qualityRating === 'poor') {
      AccessibilityInfo.announceForAccessibility(
        'Warning: Connection quality is poor. You may experience lag or disconnection.'
      );
    }

    prevQualityRatingRef.current = qualityRating;
  }, [isConnected, quality, qualityRating]);

  const getStatusColor = () => {
    if (isConnected) return theme.colors.success;
    if (isReconnecting) return theme.colors.warning;
    if (isFailed) return theme.colors.error;
    return theme.colors.textSecondary;
  };

  // Animated styles
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: iconScale.value },
      { translateX: shakeX.value },
    ],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: bgFlash.value > 0
      ? `rgba(255, 45, 45, ${bgFlash.value * 0.2})`
      : undefined,
  }));

  if (compact) {
    return (
      <Animated.View
        style={[styles.compactContainer, isConnected && styles.compactConnected, containerAnimatedStyle]}
        accessible
        accessibilityLabel={`Connection status: ${info.label}${isConnected && quality ? `, latency ${quality.latencyMs} milliseconds` : ''}`}
        accessibilityLiveRegion="polite"
      >
        <Animated.View style={iconAnimatedStyle}>
          <Ionicons
            name={isConnected ? 'ellipse' : info.icon}
            size={isConnected ? 5 : 14}
            color={getStatusColor()}
          />
        </Animated.View>
        <Animated.Text
          key={step}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.duration(200)}
          style={[styles.compactLabel, isConnected && styles.labelConnected]}
        >
          {info.label.toLowerCase()}
        </Animated.Text>
        {isConnected && quality && (
          <>
            <View
              style={[
                styles.qualityDot,
                { backgroundColor: qualityColors[qualityRating] },
              ]}
            />
            <Text style={styles.compactQuality}>
              {quality.latencyMs}ms
            </Text>
          </>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.container, containerAnimatedStyle]}
      accessible
      accessibilityLabel={`Connection status: ${info.label}${isConnected && quality ? `. Quality: ${formatQuality(quality)}` : ''}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.statusRow}>
        <Animated.View style={iconAnimatedStyle}>
          <Ionicons
            name={info.icon}
            size={18}
            color={getStatusColor()}
          />
        </Animated.View>
        <Animated.Text
          key={step}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.duration(200)}
          style={[styles.label, isConnected && styles.labelConnected]}
        >
          {info.label.toLowerCase()}
        </Animated.Text>
      </View>

      {isConnected && quality && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.qualityRow}
        >
          <View
            style={[
              styles.qualityDot,
              { backgroundColor: qualityColors[qualityRating] },
            ]}
          />
          <Text style={styles.qualityText}>
            {formatQuality(quality)}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    overflow: 'hidden' as const,
  },
  compactContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    overflow: 'hidden' as const,
  },
  compactConnected: {
    backgroundColor: theme.colors.successBackground,
    borderWidth: 1,
    borderColor: 'rgba(0,204,102,0.15)',
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: 11,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
  },
  compactLabel: {
    fontSize: 10,
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
  },
  labelConnected: {
    color: theme.colors.success,
    fontFamily: theme.fontFamily.bodySemiBold,
  },
  qualityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  qualityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  qualityText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontFamily: theme.fontFamily.mono,
    textTransform: 'lowercase' as const,
  },
  compactQuality: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontFamily: theme.fontFamily.mono,
  },
}));
