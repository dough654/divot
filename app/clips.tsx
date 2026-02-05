import { StyleSheet, View, Text, FlatList, Pressable, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';
import { listClips, deleteClip, renameClip } from '@/src/services/recording/clip-storage';
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
  onMenuPress: () => void;
  isDark: boolean;
};

const ClipItem = ({ clip, onPress, onMenuPress, isDark }: ClipItemProps) => {
  const styles = createItemStyles(isDark);

  const clipName = clip.name || `Swing ${formatDate(clip.timestamp)}`;

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${clipName}, ${formatDuration(clip.duration)}, ${formatFileSize(clip.fileSize)}`}
      accessibilityHint="Open clip for playback"
    >
      <View style={styles.thumbnail}>
        <Ionicons name="videocam" size={24} color="#888" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {clipName}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{formatDuration(clip.duration)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatFileSize(clip.fileSize)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{clip.fps}fps</Text>
        </View>
      </View>
      <Pressable
        style={styles.menuButton}
        onPress={onMenuPress}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${clipName}`}
        accessibilityHint="Open menu to rename or delete clip"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={isDark ? '#888' : '#666'} />
      </Pressable>
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
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [clipToRename, setClipToRename] = useState<Clip | null>(null);
  const [renameText, setRenameText] = useState('');

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

  const handleClipLongPress = useCallback((clip: Clip) => {
    Alert.alert(
      clip.name || 'Swing Recording',
      'What would you like to do?',
      [
        {
          text: 'Rename',
          onPress: () => {
            setClipToRename(clip);
            setRenameText(clip.name || '');
            setRenameModalVisible(true);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteClip(clip),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }, []);

  const handleDeleteClip = useCallback((clip: Clip) => {
    Alert.alert(
      'Delete Clip',
      'Are you sure you want to delete this clip? This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteClip(clip.id);
            loadClips();
          },
        },
      ]
    );
  }, [loadClips]);

  const handleRenameConfirm = useCallback(async () => {
    if (!clipToRename) return;

    const trimmedName = renameText.trim();
    if (trimmedName) {
      await renameClip(clipToRename.id, trimmedName);
      loadClips();
    }

    setRenameModalVisible(false);
    setClipToRename(null);
    setRenameText('');
  }, [clipToRename, renameText, loadClips]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setClipToRename(null);
    setRenameText('');
  }, []);

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
          <Pressable
            style={styles.recordButton}
            onPress={() => router.push('/camera')}
            accessibilityRole="button"
            accessibilityLabel="Go to Camera"
            accessibilityHint="Navigate to camera mode to record clips"
          >
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
            onMenuPress={() => handleClipLongPress(item)}
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

      {/* Rename Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleRenameCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Clip</Text>
            <TextInput
              style={styles.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Enter clip name"
              placeholderTextColor={isDark ? '#666' : '#999'}
              autoFocus
              selectTextOnFocus
              accessibilityLabel="Clip name"
              accessibilityHint="Enter a new name for this clip"
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalButtonCancel}
                onPress={handleRenameCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityHint="Cancel renaming and close dialog"
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButtonConfirm}
                onPress={handleRenameConfirm}
                accessibilityRole="button"
                accessibilityLabel="Save"
                accessibilityHint="Save the new clip name"
              >
                <Text style={styles.modalButtonConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    modalContent: {
      width: '100%',
      backgroundColor: isDark ? '#2a2a4e' : '#fff',
      borderRadius: 16,
      padding: 24,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#fff' : '#1a1a2e',
      marginBottom: 16,
    },
    modalInput: {
      backgroundColor: isDark ? '#1a1a2e' : '#f5f5f5',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: isDark ? '#fff' : '#1a1a2e',
      marginBottom: 20,
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    modalButtonCancel: {
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    modalButtonCancelText: {
      fontSize: 16,
      color: isDark ? '#888' : '#666',
    },
    modalButtonConfirm: {
      backgroundColor: '#4CAF50',
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
    },
    modalButtonConfirmText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
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
    menuButton: {
      padding: 8,
      marginLeft: 4,
    },
  });
