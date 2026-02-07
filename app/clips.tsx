import { View, Text, FlatList, Pressable, RefreshControl, Alert, Modal, TextInput, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles, usePressAnimation } from '@/src/hooks';
import { EmptyState, SkeletonClipItem } from '@/src/components/ui';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
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

const ClipItem = ({ clip, onPress, onMenuPress, index }: ClipItemProps & { index: number }) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createItemStyles);

  const { animatedStyle, handlePressIn, handlePressOut } = usePressAnimation({
    defaultColor: 'transparent',
    pressedColor: theme.colors.accentDim,
  });

  const clipName = clip.name || `Swing ${formatDate(clip.timestamp)}`;

  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${clipName}, ${formatDuration(clip.duration)}, ${formatFileSize(clip.fileSize)}`}
      accessibilityHint="Open clip for playback"
    >
      <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {clipName}
        </Text>
        <Text style={styles.meta}>
          {formatDuration(clip.duration)} · {formatFileSize(clip.fileSize)} · {clip.fps}fps
        </Text>
      </View>
      <Pressable
        style={styles.menuButton}
        onPress={onMenuPress}
        android_ripple={Platform.OS === 'android' ? { color: theme.colors.accentDim, borderless: true } : undefined}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${clipName}`}
        accessibilityHint="Open menu to rename or delete clip"
      >
        <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textTertiary} />
      </Pressable>
    </AnimatedPressable>
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
      <View style={styles.container}>
        <View style={styles.listContent}>
          <SkeletonClipItem />
          <View style={styles.separator} />
          <SkeletonClipItem />
          <View style={styles.separator} />
          <SkeletonClipItem />
        </View>
      </View>
    );
  }

  if (clips.length === 0) {
    return (
      <View style={styles.container}>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={clips}
        numColumns={1}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ClipItem
            clip={item}
            index={index}
            onPress={() => handleClipPress(item)}
            onMenuPress={() => handleClipLongPress(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerCount}>{clips.length} clip{clips.length !== 1 ? 's' : ''}</Text>
          </View>
        }
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
        supportedOrientations={['portrait']}
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
                android_ripple={Platform.OS === 'android' ? { color: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' } : undefined}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityHint="Cancel renaming and close dialog"
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButtonConfirm}
                onPress={handleRenameConfirm}
                android_ripple={Platform.OS === 'android' ? { color: 'rgba(255, 255, 255, 0.3)' } : undefined}
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
    </View>
  );
}

const createStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 4,
    marginBottom: theme.spacing.sm,
  },
  headerCount: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: 2,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 48,
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
    fontFamily: theme.fontFamily.display,
    fontSize: 24,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.5,
    marginBottom: theme.spacing.lg,
  },
  modalInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontFamily: theme.fontFamily.body,
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
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.sm,
  },
  modalButtonConfirmText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: theme.fontSize.md,
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
}));

const createItemStyles = makeThemedStyles((theme: Theme) => ({
  container: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  number: {
    fontFamily: theme.fontFamily.display,
    fontSize: 24,
    color: theme.colors.textTertiary,
    width: 32,
    textAlign: 'right' as const,
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: theme.fontFamily.display,
    fontSize: 18,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  meta: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
  },
  menuButton: {
    padding: theme.spacing.sm,
  },
}));
