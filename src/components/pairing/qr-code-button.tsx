import { StyleSheet, View, Text, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';

export type QRCodeButtonProps = {
  roomCode: string;
  onPress: () => void;
  isPulsing: boolean;
  isDark?: boolean;
};

/**
 * Compact button that shows the room code and opens the QR code modal.
 * Pulses to draw attention until first click.
 */
export const QRCodeButton = ({
  roomCode,
  onPress,
  isPulsing,
  isDark = false,
}: QRCodeButtonProps) => {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPulsing) {
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
  }, [isPulsing, glowAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isDark ? '#3a3a5e' : '#e0e0e0', '#4CAF50'],
  });

  const borderWidth = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3],
  });

  return (
    <Animated.View
      style={[
        styles.animatedWrapper,
        isPulsing && {
          borderColor,
          borderWidth,
        },
      ]}
    >
      <Pressable
        style={[styles.container, isDark && styles.containerDark]}
        onPress={onPress}
      >
        <View style={styles.qrIconContainer}>
          <Ionicons name="qr-code" size={24} color={isDark ? '#ffffff' : '#1a1a2e'} />
        </View>

        <View style={styles.content}>
          <Text style={[styles.label, isDark && styles.labelDark]}>Room Code</Text>
          <Text style={[styles.code, isDark && styles.codeDark]}>{roomCode}</Text>
        </View>

        <View style={styles.action}>
          <Text style={styles.actionText}>Show QR</Text>
          <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
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
});
