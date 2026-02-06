import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';

import { useTheme } from '../../context';
import { useThemedStyles, makeThemedStyles } from '../../hooks';
import type { Theme } from '../../context';

export type QRCodeButtonProps = {
  roomCode: string | null;
  onPress: () => void;
  isPulsing: boolean;
  isLoading?: boolean;
};

/**
 * Compact button that shows the room code and opens the QR code modal.
 * Pulses to draw attention until first click.
 * Shows loading state while room code is being generated.
 */
export const QRCodeButton = ({
  roomCode,
  onPress,
  isPulsing,
  isLoading = false,
}: QRCodeButtonProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const readyAnim = useRef(new Animated.Value(0)).current;

  // Pulsing glow animation
  useEffect(() => {
    if (isPulsing && !isLoading) {
      const glowAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      );

      glowAnimation.start();

      return () => {
        glowAnimation.stop();
      };
    } else {
      glowAnim.setValue(0);
    }
  }, [isPulsing, isLoading, glowAnim]);

  // Animate transition from loading to ready - dramatic balloon effect
  useEffect(() => {
    if (!isLoading && roomCode) {
      readyAnim.setValue(0);

      Animated.sequence([
        // Balloon up big
        Animated.timing(readyAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }),
        // Settle back down
        Animated.spring(readyAnim, {
          toValue: 0,
          useNativeDriver: false,
          tension: 80,
          friction: 6,
        }),
      ]).start();
    } else {
      readyAnim.setValue(0);
    }
  }, [isLoading, roomCode, readyAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, theme.colors.accent],
  });

  const borderWidth = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3],
  });

  const readyScale = readyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });

  return (
    <Animated.View
      style={[
        styles.animatedWrapper,
        isPulsing && !isLoading && {
          borderColor,
          borderWidth,
        },
        {
          transform: [{ scale: readyScale }],
        },
      ]}
    >
      <Pressable
        style={styles.container}
        onPress={onPress}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={isLoading ? 'Generating room code' : `Room code ${roomCode}. Show QR code`}
        accessibilityHint={isLoading ? 'Please wait while room code is generated' : 'Opens QR code for viewer to scan'}
        accessibilityState={{ disabled: isLoading }}
      >
        <View style={[styles.qrIconContainer, isLoading && styles.qrIconContainerLoading]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          ) : (
            <Ionicons name="qr-code" size={24} color={theme.colors.text} />
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.label}>
            {isLoading ? 'Generating...' : 'Room Code'}
          </Text>
          {isLoading ? (
            <View style={styles.loadingPlaceholder}>
              <Text style={styles.loadingText}>--- ---</Text>
            </View>
          ) : (
            <Text style={styles.code}>{roomCode}</Text>
          )}
        </View>

        <View style={styles.action}>
          {isLoading ? (
            <Text style={styles.actionTextLoading}>
              Please wait
            </Text>
          ) : (
            <>
              <Text style={styles.actionText}>Show QR</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  animatedWrapper: {
    borderRadius: 14,
  },
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  qrIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  qrIconContainerLoading: {
    backgroundColor: theme.colors.backgroundTertiary,
  },
  content: {
    flex: 1,
  },
  label: {
    fontFamily: theme.fontFamily.body,
    fontSize: 9,
    color: theme.colors.textSecondary,
    textTransform: 'lowercase' as const,
  },
  code: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 18,
    color: theme.colors.text,
    letterSpacing: 2,
  },
  action: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  actionText: {
    fontFamily: theme.fontFamily.bodyMedium,
    fontSize: 9,
    color: theme.colors.accent,
    textTransform: 'lowercase' as const,
  },
  actionTextLoading: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  loadingPlaceholder: {
    height: 22,
    justifyContent: 'center' as const,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textTertiary,
    letterSpacing: 2,
    fontFamily: 'SpaceMono',
  },
}));
