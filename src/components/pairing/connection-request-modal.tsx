import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ConnectionRequestModalProps = {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Display name of the requesting device. */
  deviceName: string;
  /** Platform of the requesting device. */
  platform: string;
  /** Called when the camera user accepts the connection. */
  onAccept: () => void;
  /** Called when the camera user explicitly taps Decline. */
  onDecline: () => void;
  /** Called when the countdown timer expires. Falls back to onDecline if not provided. */
  onTimeout?: () => void;
  /** Timeout in seconds before auto-declining. Defaults to 30. */
  timeoutSeconds?: number;
};

/**
 * Modal shown on the camera device when a viewer requests to connect via BLE tap.
 * Displays the requester info and accept/decline buttons with a countdown timer.
 */
export const ConnectionRequestModal = ({
  visible,
  deviceName,
  platform,
  onAccept,
  onDecline,
  onTimeout,
  timeoutSeconds = 30,
}: ConnectionRequestModalProps) => {
  const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevExpiredRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setSecondsLeft(timeoutSeconds);
      setExpired(false);

      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visible, timeoutSeconds]);

  // Fire timeout callback only on the rising edge of `expired` (false → true).
  // Without this guard, re-opening the modal re-triggers the expired effect because
  // onTimeout changes reference (pendingRequest changed) while expired is still true
  // from the previous session — the queued setExpired(false) hasn't flushed yet.
  useEffect(() => {
    if (expired && !prevExpiredRef.current) {
      (onTimeout ?? onDecline)();
    }
    prevExpiredRef.current = expired;
  }, [expired, onTimeout, onDecline]);

  const platformIcon: keyof typeof Ionicons.glyphMap =
    platform === 'ios' ? 'logo-apple' : 'logo-android';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
      supportedOrientations={['portrait']}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <View style={styles.platformBadge}>
              <Ionicons name={platformIcon} size={24} color="#fff" />
            </View>
          </View>

          <Text style={styles.title}>Connection Request</Text>
          <Text style={styles.message}>
            <Text style={styles.deviceName}>{deviceName || 'A device'}</Text>
            {' wants to connect'}
          </Text>

          <Text style={styles.timer}>
            Auto-declining in {secondsLeft}s
          </Text>

          <View style={styles.buttons}>
            <Pressable
              style={styles.declineButton}
              onPress={onDecline}
              accessibilityRole="button"
              accessibilityLabel="Decline connection"
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>

            <Pressable
              style={styles.acceptButton}
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept connection"
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0D0D0D',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 16,
  },
  platformBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  deviceName: {
    color: '#fff',
    fontWeight: '600',
  },
  timer: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    color: '#888',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#E5A020',
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});
