import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type NoInternetCardProps = {
  /** Called when the user taps the go-back button. */
  onGoBack: () => void;
};

/**
 * Inline card displayed when a cross-platform BLE connection is blocked
 * due to missing internet connectivity.
 */
export const NoInternetCard = ({ onGoBack }: NoInternetCardProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="wifi-outline" size={48} color="#888" />
        </View>

        <Text style={styles.title}>Internet Required</Text>
        <Text style={styles.message}>
          Connecting to a device on a different platform requires an internet connection to reach the signaling server.
        </Text>

        <Pressable
          style={styles.button}
          onPress={onGoBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
});
