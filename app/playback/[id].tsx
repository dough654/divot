import { StyleSheet, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';
import { VideoPlayer } from '@/src/components/playback';
import { getClip } from '@/src/services/recording/clip-storage';
import type { Clip } from '@/src/types/recording';

/**
 * Formats a timestamp to a readable date string.
 */
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function PlaybackScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [clip, setClip] = useState<Clip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadClip = async () => {
      if (!id) {
        setError('No clip ID provided');
        setIsLoading(false);
        return;
      }

      try {
        const foundClip = await getClip(id);
        if (foundClip) {
          setClip(foundClip);
        } else {
          setError('Clip not found');
        }
      } catch (err) {
        setError('Failed to load clip');
        console.error('Failed to load clip:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadClip();
  }, [id]);

  const styles = createStyles(isDark);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContent}>
            <Text style={styles.loadingText}>Loading clip...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (error || !clip) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.centerContent}>
            <Ionicons name="alert-circle-outline" size={64} color="#f44336" />
            <Text style={styles.errorTitle}>{error || 'Clip not found'}</Text>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const clipTitle = clip.name || `Swing Recording`;

  return (
    <>
      <Stack.Screen
        options={{
          title: clipTitle,
          headerRight: () => (
            <View style={styles.headerInfo}>
              <Text style={styles.headerDate}>{formatDate(clip.timestamp)}</Text>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        <VideoPlayer uri={clip.path} />
      </View>
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? '#888' : '#666',
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#fff' : '#1a1a2e',
      marginTop: 16,
      marginBottom: 24,
    },
    backButton: {
      backgroundColor: '#4CAF50',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
    },
    backButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    headerInfo: {
      marginRight: 8,
    },
    headerDate: {
      fontSize: 12,
      color: isDark ? '#888' : '#666',
    },
  });
