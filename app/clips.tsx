import { View, Text, FlatList, Pressable, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { EmptyState } from '@/src/components/ui';
import type { Theme } from '@/src/context';
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
};

const ClipItem = ({ clip, onPress, onMenuPress }: ClipItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createItemStyles);

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
        <Ionicons name="videocam" size={24} color={theme.colors.textTertiary} />
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
        <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
};

export default function ClipsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

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
        <EmptyState
          icon="videocam-off-outline"
          title="No Clips Yet"
          description="Record your first swing in Camera mode to see it here."
          action={{
            label: 'Go to Camera',
            onPress: () => router.push('/camera'),
            icon: 'videocam',
          }}
        />
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
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text}
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
              placeholderTextColor={theme.colors.textTertiary}
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

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
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
  listContent: {
    padding: theme.spacing.md,
  },
  separator: {
    height: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing['3xl'],
  },
  modalContent: {
    width: '100%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing['2xl'],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  modalInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing.md,
  },
  modalButtonCancel: {
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.xl,
  },
  modalButtonCancelText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.sm,
  },
  modalButtonConfirmText: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    color: theme.palette.white,
  },
}));

const createItemStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing.md,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  metaText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  metaDot: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginHorizontal: 6,
  },
  menuButton: {
    padding: theme.spacing.sm,
    marginLeft: 4,
  },
}));
