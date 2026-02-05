import { StyleSheet, View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TransferProgress } from '@/src/services/clip-sync';

type TransferProgressModalProps = {
  visible: boolean;
  progress: TransferProgress;
  onCancel: () => void;
  onDismiss: () => void;
};

/**
 * Modal showing clip transfer progress.
 */
export const TransferProgressModal = ({
  visible,
  progress,
  onCancel,
  onDismiss,
}: TransferProgressModalProps) => {
  const isSending = progress.state === 'sending';
  const isReceiving = progress.state === 'receiving';
  const isComplete = progress.state === 'complete';
  const isError = progress.state === 'error';
  const isActive = isSending || isReceiving;

  const getTitle = () => {
    if (isSending) return 'Sending Clip';
    if (isReceiving) return 'Receiving Clip';
    if (isComplete) return 'Transfer Complete';
    if (isError) return 'Transfer Failed';
    return 'Syncing';
  };

  const getIcon = () => {
    if (isComplete) return 'checkmark-circle';
    if (isError) return 'alert-circle';
    if (isSending) return 'cloud-upload';
    if (isReceiving) return 'cloud-download';
    return 'sync';
  };

  const getIconColor = () => {
    if (isComplete) return '#4CAF50';
    if (isError) return '#f44336';
    return '#2196F3';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isActive ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            {isActive ? (
              <ActivityIndicator size="large" color="#2196F3" />
            ) : (
              <Ionicons name={getIcon()} size={48} color={getIconColor()} />
            )}
          </View>

          <Text style={styles.title}>{getTitle()}</Text>

          {progress.clipName && (
            <Text style={styles.clipName} numberOfLines={1}>
              {progress.clipName}
            </Text>
          )}

          {isActive && (
            <>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress.progress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>
                {progress.progress}% ({progress.completedChunks} / {progress.totalChunks} chunks)
              </Text>
            </>
          )}

          {isError && (
            <Text style={styles.errorText}>{progress.error}</Text>
          )}

          <View style={styles.buttons}>
            {isActive ? (
              <Pressable
                style={styles.cancelButton}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel transfer"
                accessibilityHint="Stop the current file transfer"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.dismissButton}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={isComplete ? 'Done' : 'Close'}
                accessibilityHint="Close this dialog"
              >
                <Text style={styles.dismissButtonText}>
                  {isComplete ? 'Done' : 'Close'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    width: '100%',
    backgroundColor: '#2a2a4e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  clipName: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#888',
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
