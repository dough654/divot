import { StyleSheet, View, Text, Switch, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';

const STORAGE_KEY_CONNECTION_MODE = '@swinglink/connection_mode';

type ConnectionMode = 'auto' | 'hotspot';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('auto');

  const styles = createStyles(isDark);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(STORAGE_KEY_CONNECTION_MODE);
      if (savedMode === 'auto' || savedMode === 'hotspot') {
        setConnectionMode(savedMode);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleConnectionModeChange = async (useHotspot: boolean) => {
    const newMode: ConnectionMode = useHotspot ? 'hotspot' : 'auto';
    setConnectionMode(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_CONNECTION_MODE, newMode);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Always Use Hotspot</Text>
            <Text style={styles.settingDescription}>
              Skip local WiFi discovery and go straight to hotspot mode
            </Text>
          </View>
          <Switch
            value={connectionMode === 'hotspot'}
            onValueChange={handleConnectionModeChange}
            trackColor={{ false: '#767577', true: '#4CAF50' }}
            thumbColor={connectionMode === 'hotspot' ? '#ffffff' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection Modes</Text>

        <Pressable
          style={[
            styles.modeCard,
            connectionMode === 'auto' && styles.modeCardSelected,
          ]}
          onPress={() => handleConnectionModeChange(false)}
        >
          <View style={styles.modeHeader}>
            <Ionicons
              name="wifi"
              size={24}
              color={connectionMode === 'auto' ? '#4CAF50' : isDark ? '#888' : '#666'}
            />
            <Text style={[styles.modeTitle, connectionMode === 'auto' && styles.modeTitleSelected]}>
              Auto Mode
            </Text>
            {connectionMode === 'auto' && (
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            )}
          </View>
          <Text style={styles.modeDescription}>
            Tries local WiFi first (5 second timeout), then falls back to hotspot if devices can't
            connect directly.
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.modeCard,
            connectionMode === 'hotspot' && styles.modeCardSelected,
          ]}
          onPress={() => handleConnectionModeChange(true)}
        >
          <View style={styles.modeHeader}>
            <Ionicons
              name="phone-portrait"
              size={24}
              color={connectionMode === 'hotspot' ? '#4CAF50' : isDark ? '#888' : '#666'}
            />
            <Text style={[styles.modeTitle, connectionMode === 'hotspot' && styles.modeTitleSelected]}>
              Hotspot Mode
            </Text>
            {connectionMode === 'hotspot' && (
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            )}
          </View>
          <Text style={styles.modeDescription}>
            Always uses phone hotspot for the best, most reliable connection. Recommended for golf
            courses with unreliable WiFi.
          </Text>
        </Pressable>
      </View>

      <View style={styles.infoSection}>
        <Ionicons name="information-circle-outline" size={20} color={isDark ? '#888' : '#666'} />
        <Text style={styles.infoText}>
          Hotspot mode provides dedicated bandwidth and lower latency, but requires one device to
          enable its mobile hotspot.
        </Text>
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
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 12,
      padding: 16,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#1a1a2e',
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: 13,
      color: isDark ? '#888' : '#666',
      lineHeight: 18,
    },
    modeCard: {
      backgroundColor: isDark ? '#2a2a4e' : '#ffffff',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    modeCardSelected: {
      borderColor: '#4CAF50',
    },
    modeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 10,
    },
    modeTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#1a1a2e',
    },
    modeTitleSelected: {
      color: '#4CAF50',
    },
    modeDescription: {
      fontSize: 13,
      color: isDark ? '#888' : '#666',
      lineHeight: 18,
    },
    infoSection: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? '#2a2a4e' : '#e8f5e9',
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: isDark ? '#888' : '#666',
      lineHeight: 18,
    },
  });
