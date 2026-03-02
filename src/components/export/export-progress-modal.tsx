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
  /** Message shown at completion (e.g., "Saved to gallery", "Shared"). */
  completionMessage: string | null;
  /** Called when cancel is tapped during encoding. */
  onCancel: () => void;
  /** Called when "done" resets the flow. */
  onDone: () => void;
  /** Called when "try again" is tapped after an error. */
  onRetry: () => void;
};

/**
 * Modal overlay shown during video export.
 * Displays preparing spinner, encoding progress bar, completion message, or error state.
 */
export const ExportProgressModal = ({
  visible,
  status,
  progress,
  errorMessage,
  completionMessage,
  onCancel,
  onDone,
  onRetry,
}: ExportProgressModalProps) => {
  const styles = useThemedStyles(createStyles);

  if (!visible || status === 'idle') return null;

  const isDismissable = status === 'complete' || status === 'cancelled' || status === 'error';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDone}
      supportedOrientations={['portrait', 'landscape']}
    >
      <Pressable
        style={styles.backdrop}
        onPress={isDismissable ? onDone : undefined}
        disabled={!isDismissable}
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {isDismissable && (
            <Pressable style={styles.closeButton} onPress={onDone}>
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          )}

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
              <Pressable style={styles.cancelTextButton} onPress={onCancel}>
                <Text style={styles.cancelTextButtonText}>cancel</Text>
              </Pressable>
            </>
          )}

          {status === 'complete' && (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
              <Text style={styles.statusText}>
                {completionMessage ?? 'export complete'}
              </Text>
            </>
          )}

          {status === 'error' && (
            <>
              <Ionicons name="alert-circle" size={48} color="#FF5252" />
              <Text style={styles.statusText}>export failed</Text>
              {errorMessage && (
                <Text style={styles.errorText} numberOfLines={3}>{errorMessage}</Text>
              )}
              <Pressable style={styles.retryButton} onPress={onRetry}>
                <Text style={styles.retryButtonText}>try again</Text>
              </Pressable>
            </>
          )}

          {status === 'cancelled' && (
            <>
              <Ionicons name="close-circle" size={48} color="#999" />
              <Text style={styles.statusText}>export cancelled</Text>
            </>
          )}
        </Pressable>
      </Pressable>
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
  closeButton: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelTextButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelTextButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.textSecondary,
    fontSize: 14,
    textTransform: 'lowercase' as const,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
  },
  retryButtonText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 15,
    textTransform: 'lowercase' as const,
  },
}));
