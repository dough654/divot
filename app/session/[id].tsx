import { View, Text, FlatList, Pressable, Alert, Modal, TextInput, Platform, ActivityIndicator, Share } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useToast } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { useScreenOrientation } from '@/src/hooks/use-screen-orientation';
import { ClipItem } from '@/src/components/clips';
import type { Theme } from '@/src/context';
import type { Session } from '@/src/types/session';
import type { Clip, CameraAngle } from '@/src/types/recording';
import { getSession, updateSessionNotes } from '@/src/services/session/session-storage';
import { listClipsBySession } from '@/src/services/recording/clip-storage';
import { enqueueUpload } from '@/src/services/cloud/upload-queue';
import { onUploadEvent } from '@/src/services/cloud/upload-events';
import { buildSessionSummaryText } from '@/src/utils/session-export';
import { formatRelativeDate, formatSessionDuration } from '@/src/utils/format';

export default function SessionDetailScreen() {
  useScreenOrientation({ lock: 'portrait' });
  const { theme } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(createStyles);

  const { show: showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [angleFilter, setAngleFilter] = useState<CameraAngle | 'all'>('all');

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [sessionData, sessionClips] = await Promise.all([
        getSession(id),
        listClipsBySession(id),
      ]);
      setSession(sessionData);
      setClips(sessionClips);
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload clips when upload status changes
  useEffect(() => {
    const unsubStarted = onUploadEvent('started', () => loadData());
    const unsubCompleted = onUploadEvent('completed', () => loadData());
    const unsubFailed = onUploadEvent('failed', () => loadData());
    return () => { unsubStarted(); unsubCompleted(); unsubFailed(); };
  }, [loadData]);

  const handleClipPress = useCallback((clip: Clip) => {
    router.push(`/playback/${clip.id}`);
  }, [router]);

  const handleClipMenu = useCallback((clip: Clip) => {
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      {
        text: 'Play',
        onPress: () => router.push(`/playback/${clip.id}`),
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

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(clip.name || 'Swing Recording', 'What would you like to do?', options);
  }, [router]);

  const handleEditNotes = useCallback(() => {
    setNotesText(session?.notes ?? '');
    setNotesModalVisible(true);
  }, [session]);

  const handleSaveNotes = useCallback(async () => {
    if (!session) return;
    const trimmed = notesText.trim();
    await updateSessionNotes(session.id, trimmed);
    setSession((prev) => prev ? { ...prev, notes: trimmed } : prev);
    setNotesModalVisible(false);
  }, [session, notesText]);

  const handleShare = useCallback(async () => {
    if (!session) return;
    try {
      const text = buildSessionSummaryText(session, clips);
      await Share.share({ message: text });
    } catch (err) {
      console.error('Failed to share session:', err);
    }
  }, [session, clips]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Session not found</Text>
        </View>
      </View>
    );
  }

  // Determine if clips have mixed angles (show filter only if so)
  const angleSet = new Set(clips.map((c) => c.cameraAngle).filter(Boolean));
  const hasMixedAngles = angleSet.size > 1;

  const filteredClips = angleFilter === 'all'
    ? clips
    : clips.filter((c) => c.cameraAngle === angleFilter);

  const clipCount = filteredClips.length;
  const totalDuration = filteredClips.reduce((sum, c) => sum + c.duration, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredClips}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ClipItem
            clip={item}
            index={index}
            onPress={() => handleClipPress(item)}
            onMenuPress={() => handleClipMenu(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Date + Duration */}
            <Text style={styles.dateText}>
              {formatRelativeDate(session.startedAt)}
            </Text>
            <Text style={styles.durationText}>
              {formatSessionDuration(session.startedAt, session.endedAt)}
            </Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{clipCount}</Text>
                <Text style={styles.statLabel}>clip{clipCount !== 1 ? 's' : ''}</Text>
              </View>
              {totalDuration > 0 && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{Math.ceil(totalDuration / 60)}</Text>
                  <Text style={styles.statLabel}>min recorded</Text>
                </View>
              )}
              {session.location?.displayName && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color={theme.colors.textTertiary} />
                  <Text style={styles.locationText}>{session.location.displayName}</Text>
                </View>
              )}
            </View>

            {/* Angle filter chips — only when session has mixed angles */}
            {hasMixedAngles && (
              <View style={styles.filterRow}>
                {(['all', 'dtl', 'face-on'] as const).map((value) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.filterChip,
                      angleFilter === value && styles.filterChipActive,
                    ]}
                    onPress={() => setAngleFilter(value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${value === 'all' ? 'all angles' : value === 'dtl' ? 'down the line' : 'face on'}`}
                    accessibilityState={{ selected: angleFilter === value }}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        angleFilter === value && styles.filterChipTextActive,
                      ]}
                    >
                      {value === 'all' ? 'All' : value === 'dtl' ? 'DTL' : 'Face-On'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Notes */}
            <Pressable style={styles.notesSection} onPress={handleEditNotes}>
              {session.notes ? (
                <Text style={styles.notesContent}>{session.notes}</Text>
              ) : (
                <Text style={styles.notesPlaceholder}>Tap to add notes...</Text>
              )}
            </Pressable>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <Pressable style={styles.actionButton} onPress={handleShare}>
                <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
            </View>

            {/* Clips header */}
            {clipCount > 0 && (
              <Text style={styles.clipsHeader}>
                {clipCount} clip{clipCount !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyClips}>
            <Text style={styles.emptyText}>No clips in this session</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Notes Modal */}
      <Modal
        visible={notesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesModalVisible(false)}
        supportedOrientations={['portrait']}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Session Notes</Text>
            <TextInput
              style={styles.modalInput}
              value={notesText}
              onChangeText={setNotesText}
              placeholder="Add notes about this session..."
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              numberOfLines={4}
              autoFocus
              accessibilityLabel="Session notes"
              accessibilityHint="Enter notes about this practice session"
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.modalButtonCancel}
                onPress={() => setNotesModalVisible(false)}
                android_ripple={Platform.OS === 'android' ? { color: theme.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' } : undefined}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalButtonConfirm}
                onPress={handleSaveNotes}
                android_ripple={Platform.OS === 'android' ? { color: 'rgba(255, 255, 255, 0.3)' } : undefined}
                accessibilityRole="button"
                accessibilityLabel="Save notes"
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  headerSection: {
    marginBottom: theme.spacing.lg,
  },
  dateText: {
    fontFamily: theme.fontFamily.display,
    fontSize: 28,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.5,
  },
  durationText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    marginTop: theme.spacing.md,
  },
  stat: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: 4,
  },
  statValue: {
    fontFamily: theme.fontFamily.display,
    fontSize: 22,
    color: theme.colors.text,
  },
  statLabel: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  locationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  locationText: {
    fontFamily: theme.fontFamily.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  notesSection: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  notesContent: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    lineHeight: 22,
  },
  notesPlaceholder: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.md,
    color: theme.colors.textTertiary,
    fontStyle: 'italic' as const,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: theme.spacing.md,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionText: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: theme.spacing.md,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterChipText: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  filterChipTextActive: {
    color: theme.isDark ? theme.palette.black : theme.palette.white,
  },
  clipsHeader: {
    fontFamily: theme.fontFamily.body,
    fontSize: 15,
    color: theme.colors.textTertiary,
    textTransform: 'lowercase' as const,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xs,
  },
  emptyClips: {
    paddingVertical: theme.spacing['3xl'],
    alignItems: 'center' as const,
  },
  emptyText: {
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.md,
    color: theme.colors.textTertiary,
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
    minHeight: 80,
    textAlignVertical: 'top' as const,
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
