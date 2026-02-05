import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, useOrientation } from '@/src/hooks';
import type { Theme } from '@/src/context';
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
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { isLandscape } = useOrientation();
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

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
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
        <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
          <View style={styles.centerContent}>
            <Ionicons name="alert-circle-outline" size={64} color={theme.colors.error} />
            <Text style={styles.errorTitle}>{error || 'Clip not found'}</Text>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go Back"
              accessibilityHint="Return to clips list"
            >
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
          headerShown: !isLandscape,
          headerTitle: () => (
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>{clipTitle}</Text>
              <Text style={styles.headerDate}>{formatDate(clip.timestamp)}</Text>
            </View>
          ),
        }}
      />
      <View style={styles.container}>
        <VideoPlayer uri={clip.path} clipId={clip.id} />
      </View>
    </>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing['3xl'],
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing['2xl'],
  },
  backButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing['2xl'],
    borderRadius: theme.borderRadius.sm,
  },
  backButtonText: {
    color: theme.palette.white,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  headerTitleContainer: {
    alignItems: 'center' as const,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
  },
  headerDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
}));
