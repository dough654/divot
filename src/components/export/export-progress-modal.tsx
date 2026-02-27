import { View, Text, Pressable, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

type ExportStatus = 'idle' | 'preparing' | 'encoding' | 'complete' | 'error' | 'cancelled';

type ExportProgressModalProps = {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Current export status. */
  status: ExportStatus;
  /** Encoding progress fraction 0-1. */
  progress: number;
  /** Error message to display. */
  errorMessage: string | null;
  /** Called when cancel is tapped during encoding. */
  onCancel: () => void;
  /** Called when "save to gallery" is tapped after completion. */
  onSaveToGallery: () => void;
  /** Called when "share" is tapped after completion. */
  onShare: () => void;
  /** Called when "done" or "try again" resets the flow. */
  onDone: () => void;
  /** Called when "try again" is tapped after an error. */
  onRetry: () => void;
};

/**
 * Modal overlay shown during video export.
 * Displays preparing spinner, encoding progress bar, completion actions, or error state.
 */
export const ExportProgressModal = ({
  visible,
  status,
  progress,
  errorMessage,
  onCancel,
  onSaveToGallery,
  onShare,
  onDone,
  onRetry,
}: ExportProgressModalProps) => {
  const styles = useThemedStyles(createStyles);

  if (!visible || status === 'idle') return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDone}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {status === 'preparing' && (
            <>
              <ActivityIndicator size="large" color="#E5A020" />
              <Text style={styles.statusText}>preparing...</Text>
            </>
          )}

          {status === 'encoding' && (
            <>
              <Text style={styles.statusText}>
                exporting... {Math.round(progress * 100)}%
              </Text>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Pressable style={styles.secondaryButton} onPress={onCancel}>
                <Text style={styles.secondaryButtonText}>cancel</Text>
              </Pressable>
            </>
          )}

          {status === 'complete' && (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
              <Text style={styles.statusText}>export complete</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.primaryButton} onPress={onSaveToGallery}>
                  <Ionicons name="download-outline" size={18} color="#000" />
                  <Text style={styles.primaryButtonText}>save to gallery</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={onShare}>
                  <Ionicons name="share-outline" size={18} color="#000" />
                  <Text style={styles.primaryButtonText}>share</Text>
                </Pressable>
              </View>
              <Pressable style={styles.secondaryButton} onPress={onDone}>
                <Text style={styles.secondaryButtonText}>done</Text>
              </Pressable>
            </>
          )}

          {status === 'error' && (
            <>
              <Ionicons name="alert-circle" size={48} color="#FF5252" />
              <Text style={styles.statusText}>export failed</Text>
              {errorMessage && (
                <Text style={styles.errorText} numberOfLines={3}>{errorMessage}</Text>
              )}
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={onRetry}>
                  <Text style={styles.secondaryButtonText}>try again</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={onDone}>
                  <Text style={styles.secondaryButtonText}>done</Text>
                </Pressable>
              </View>
            </>
          )}

          {status === 'cancelled' && (
            <>
              <Ionicons name="close-circle" size={48} color="#999" />
              <Text style={styles.statusText}>export cancelled</Text>
              <Pressable style={styles.secondaryButton} onPress={onDone}>
                <Text style={styles.secondaryButtonText}>done</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = makeThemedStyles((theme: Theme) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    gap: 16,
    minWidth: 280,
    maxWidth: 340,
  },
  statusText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 17,
    textTransform: 'lowercase' as const,
    fontVariant: ['tabular-nums' as const],
  },
  errorText: {
    fontFamily: theme.fontFamily.body,
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center' as const,
  },
  progressBarTrack: {
    width: '100%' as const,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressBarFill: {
    height: '100%' as const,
    backgroundColor: theme.colors.accent,
    borderRadius: 3,
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.sm,
  },
  primaryButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: '#000',
    fontSize: 14,
    textTransform: 'lowercase' as const,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
  },
  secondaryButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 14,
    textTransform: 'lowercase' as const,
  },
}));
