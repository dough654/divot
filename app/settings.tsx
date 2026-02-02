import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = createStyles(isDark);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <View style={styles.infoCard}>
          <Text style={styles.appName}>SwingLink</Text>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.description}>
            P2P video streaming for golfers. One device films, the other views in real-time.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tips</Text>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="flash" size={20} color="#FF9800" />
            <Text style={styles.tipTitle}>Best Performance</Text>
          </View>
          <Text style={styles.tipText}>
            For the lowest latency, have the camera device enable its mobile hotspot and connect
            the viewer device to it. This creates a direct connection without going through a
            WiFi router.
          </Text>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="wifi" size={20} color="#4CAF50" />
            <Text style={styles.tipTitle}>Same Network</Text>
          </View>
          <Text style={styles.tipText}>
            Both devices need to be on the same WiFi network (or hotspot) to establish
            a connection. The app uses peer-to-peer streaming - no video goes to the cloud.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
      padding: 20,
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#888' : '#666',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 16,
    },
    infoCard: {
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 12,
      padding: 20,
      alignItems: 'center',
    },
    appName: {
      fontSize: 24,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#1a1a2e',
      marginBottom: 4,
    },
    version: {
      fontSize: 14,
      color: isDark ? '#888' : '#666',
      marginBottom: 12,
    },
    description: {
      fontSize: 14,
      color: isDark ? '#aaa' : '#555',
      textAlign: 'center',
      lineHeight: 20,
    },
    tipCard: {
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    tipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    tipTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#1a1a2e',
    },
    tipText: {
      fontSize: 14,
      color: isDark ? '#888' : '#666',
      lineHeight: 20,
    },
  });
