/**
 * ClipPickerModal — Modal to select a clip for a compare slot.
 *
 * Renders a FlatList of clips reusing the ClipItem component.
 */
import { View, Text, FlatList, Pressable, Modal } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/src/context';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import { ClipItem } from '@/src/components/clips';
import { EmptyState } from '@/src/components/ui';
import { listClips } from '@/src/services/recording/clip-storage';
import type { Theme } from '@/src/context';
import type { Clip } from '@/src/types/recording';

export type ClipPickerModalProps = {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Label for the slot being picked ("A" or "B"). */
  slotLabel: string;
  /** Called when a clip is selected. */
  onSelect: (clip: Clip) => void;
  /** Called when the modal is dismissed. */
  onClose: () => void;
};

export const ClipPickerModal = ({
  visible,
  slotLabel,
  onSelect,
  onClose,
}: ClipPickerModalProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadClips = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedClips = await listClips();
      setClips(savedClips);
    } catch (err) {
      console.error('Failed to load clips for picker:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) loadClips();
  }, [visible, loadClips]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Select clip {slotLabel}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </Pressable>
          </View>

          {!isLoading && clips.length === 0 ? (
            <EmptyState
              icon="videocam-off-outline"
              title="No Clips"
              description="Record a swing first to compare."
            />
          ) : (
            <FlatList
              data={clips}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <ClipItem
                  clip={item}
                  index={index}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  onMenuPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                />
              )}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end' as const,
  },
  content: {
    maxHeight: '80%' as const,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    paddingTop: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fontFamily.display,
    fontSize: 22,
    color: theme.colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: -0.3,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 48,
  },
}));
