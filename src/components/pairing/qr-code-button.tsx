import { StyleSheet, View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';

export type QRCodeButtonProps = {
  roomCode: string | null;
  onPress: () => void;
  isPulsing: boolean;
  isLoading?: boolean;
  isDark?: boolean;
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
  isDark = false,
}: QRCodeButtonProps) => {
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
    outputRange: [isDark ? '#3a3a5e' : '#e0e0e0', '#4CAF50'],
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
        style={[styles.container, isDark && styles.containerDark]}
        onPress={onPress}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={isLoading ? 'Generating room code' : `Room code ${roomCode}. Show QR code`}
        accessibilityHint={isLoading ? 'Please wait while room code is generated' : 'Opens QR code for viewer to scan'}
        accessibilityState={{ disabled: isLoading }}
      >
        <View style={[styles.qrIconContainer, isLoading && styles.qrIconContainerLoading]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={isDark ? '#888' : '#666'} />
          ) : (
            <Ionicons name="qr-code" size={24} color={isDark ? '#ffffff' : '#1a1a2e'} />
          )}
        </View>

        <View style={styles.content}>
          <Text style={[styles.label, isDark && styles.labelDark]}>
            {isLoading ? 'Generating...' : 'Room Code'}
          </Text>
          {isLoading ? (
            <View style={styles.loadingPlaceholder}>
              <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>--- ---</Text>
            </View>
          ) : (
            <Text style={[styles.code, isDark && styles.codeDark]}>{roomCode}</Text>
          )}
        </View>

        <View style={styles.action}>
          {isLoading ? (
            <Text style={[styles.actionTextLoading, isDark && styles.actionTextLoadingDark]}>
              Please wait
            </Text>
          ) : (
            <>
              <Text style={styles.actionText}>Show QR</Text>
              <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
            </>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  animatedWrapper: {
    borderRadius: 14,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  containerDark: {
    backgroundColor: '#2a2a4e',
  },
  qrIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIconContainerLoading: {
    backgroundColor: '#e8e8e8',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelDark: {
    color: '#888',
  },
  code: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    letterSpacing: 2,
    fontFamily: 'SpaceMono',
  },
  codeDark: {
    color: '#ffffff',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
  actionTextLoading: {
    fontSize: 12,
    color: '#888',
  },
  actionTextLoadingDark: {
    color: '#666',
  },
  loadingPlaceholder: {
    height: 22,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ccc',
    letterSpacing: 2,
    fontFamily: 'SpaceMono',
  },
  loadingTextDark: {
    color: '#444',
  },
});
