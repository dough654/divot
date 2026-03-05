import { View, Text, FlatList, Pressable, RefreshControl, Alert, Modal, TextInput, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { useTheme, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { EmptyState, SkeletonClipItem } from '@/src/components/ui';
import { ClipItem } from '@/src/components/clips';
import type { Theme } from '@/src/context';
import { listClips, deleteClip, renameClip } from '@/src/services/recording/clip-storage';
import { enqueueUpload } from '@/src/services/cloud/upload-queue';
import { onUploadEvent } from '@/src/services/cloud/upload-events';
import type { Clip } from '@/src/types/recording';

export default function ClipsScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  const { show: showToast } = useToast();
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

  // Reload clip list when upload status changes
  useEffect(() => {
    const unsubStarted = onUploadEvent('started', () => loadClips());
    const unsubCompleted = onUploadEvent('completed', () => loadClips());
    const unsubFailed = onUploadEvent('failed', () => loadClips());
    return () => { unsubStarted(); unsubCompleted(); unsubFailed(); };
  }, [loadClips]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadClips();
  }, [loadClips]);

  const handleClipPress = useCallback((clip: Clip) => {
    router.push(`/playback/${clip.id}`);
  }, [router]);

  const handleClipLongPress = useCallback((clip: Clip) => {
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      {
        text: 'Rename',
        onPress: () => {
          setClipToRename(clip);
          setRenameText(clip.name || '');
          setRenameModalVisible(true);
        },
      },
    ];

    if (clip.syncStatus !== 'synced' && clip.syncStatus !== 'uploading') {
      options.push({
        text: 'Back Up',
        onPress: () => {
          enqueueUpload(clip.id, clip.path);
          showToast('Backing up to cloud...', { variant: 'info' });
        },
      });
    }

    options.push(
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteClip(clip) },
      { text: 'Cancel', style: 'cancel' },
    );

    Alert.alert(clip.name || 'Swing Recording', 'What would you like to do?', options);
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
            {clips.length >= 2 && (
              <Pressable
                style={styles.compareButton}
                onPress={() => router.push('/compare')}
                accessibilityRole="button"
                accessibilityLabel="Compare swings"
              >
                <Ionicons name="git-compare-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.compareButtonText}>compare</Text>
              </Pressable>
            )}
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
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 4,
    marginBottom: theme.spacing.sm,
  },
  compareButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  compareButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    fontSize: 13,
    color: theme.colors.accent,
    textTransform: 'lowercase' as const,
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

