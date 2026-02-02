import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  const styles = createStyles(isDark);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>SwingLink</Text>
        <Text style={styles.subtitle}>P2P Golf Swing Analysis</Text>
      </View>

      <View style={styles.roleSection}>
        <Text style={styles.sectionTitle}>Select Your Role</Text>

        <Link href="/camera" asChild>
          <Pressable style={styles.roleButton}>
            <View style={styles.roleIconContainer}>
              <Ionicons name="videocam" size={40} color="#4CAF50" />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>Camera</Text>
              <Text style={styles.roleDescription}>
                Film the swing and stream to another device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={isDark ? '#888' : '#666'} />
          </Pressable>
        </Link>

        <Link href="/viewer" asChild>
          <Pressable style={styles.roleButton}>
            <View style={styles.roleIconContainer}>
              <Ionicons name="eye" size={40} color="#2196F3" />
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={styles.roleTitle}>Viewer</Text>
              <Text style={styles.roleDescription}>
                Watch the swing stream from another device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={isDark ? '#888' : '#666'} />
          </Pressable>
        </Link>
      </View>

      <View style={styles.footer}>
        <Link href="/settings" asChild>
          <Pressable style={styles.settingsButton}>
            <Ionicons name="settings-outline" size={24} color={isDark ? '#aaa' : '#666'} />
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
      padding: 20,
    },
    header: {
      alignItems: 'center',
      marginTop: 40,
      marginBottom: 60,
    },
    title: {
      fontSize: 36,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#1a1a2e',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? '#888' : '#666',
    },
    roleSection: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#888' : '#666',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 16,
    },
    roleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    roleIconContainer: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    roleTextContainer: {
      flex: 1,
    },
    roleTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#1a1a2e',
      marginBottom: 4,
    },
    roleDescription: {
      fontSize: 14,
      color: isDark ? '#888' : '#666',
      lineHeight: 20,
    },
    footer: {
      alignItems: 'center',
      paddingBottom: 20,
    },
    settingsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
    },
    settingsText: {
      fontSize: 16,
      color: isDark ? '#aaa' : '#666',
      marginLeft: 8,
    },
  });
