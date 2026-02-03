import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';
import { listClips } from '@/src/services/recording/clip-storage';
import type { Clip } from '@/src/types/recording';

/**
 * Formats a timestamp to a readable date string.
 */
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
};

/**
 * Formats duration in seconds to MM:SS.
 */
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Formats file size in bytes to human readable format.
 */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ClipItemProps = {
  clip: Clip;
  onPress: () => void;
  isDark: boolean;
};

const ClipItem = ({ clip, onPress, isDark }: ClipItemProps) => {
  const styles = createItemStyles(isDark);

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.thumbnail}>
        <Ionicons name="videocam" size={24} color="#888" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {clip.name || `Swing ${formatDate(clip.timestamp)}`}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{formatDuration(clip.duration)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatFileSize(clip.fileSize)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{clip.fps}fps</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={isDark ? '#666' : '#999'} />
    </Pressable>
  );
};

export default function ClipsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadClips = useCallback(async () => {
    try {
      const savedClips = await listClips();
      setClips(savedClips);
    } catch (err) {
      console.error('Failed to load clips:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadClips();
  }, [loadClips]);

  const handleClipPress = useCallback((clip: Clip) => {
    router.push(`/playback/${clip.id}`);
  }, [router]);

  const styles = createStyles(isDark);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading clips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (clips.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centerContent}>
          <Ionicons name="videocam-off-outline" size={64} color={isDark ? '#444' : '#ccc'} />
          <Text style={styles.emptyTitle}>No Clips Yet</Text>
          <Text style={styles.emptySubtitle}>
            Record your first swing in Camera mode to see it here.
          </Text>
          <Pressable style={styles.recordButton} onPress={() => router.push('/camera')}>
            <Ionicons name="videocam" size={20} color="#fff" />
            <Text style={styles.recordButtonText}>Go to Camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={clips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClipItem
            clip={item}
            onPress={() => handleClipPress(item)}
            isDark={isDark}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={isDark ? '#fff' : '#000'}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? '#888' : '#666',
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: isDark ? '#fff' : '#1a1a2e',
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: isDark ? '#888' : '#666',
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    recordButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#4CAF50',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    recordButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    listContent: {
      padding: 12,
    },
    separator: {
      height: 8,
    },
  });

const createItemStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2a2a4e' : '#fff',
      borderRadius: 12,
      padding: 12,
    },
    thumbnail: {
      width: 56,
      height: 56,
      borderRadius: 8,
      backgroundColor: isDark ? '#1a1a2e' : '#f0f0f0',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    info: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? '#fff' : '#1a1a2e',
      marginBottom: 4,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaText: {
      fontSize: 13,
      color: isDark ? '#888' : '#666',
    },
    metaDot: {
      fontSize: 13,
      color: isDark ? '#555' : '#999',
      marginHorizontal: 6,
    },
  });
