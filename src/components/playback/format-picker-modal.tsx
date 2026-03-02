import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedStyles, makeThemedStyles } from '@/src/hooks';
import type { Theme } from '@/src/context';

type FormatPickerModalProps = {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Title shown at the top (e.g. "save to gallery", "share"). */
  title: string;
  /** Called when "screenshot" is selected. */
  onSelectScreenshot: () => void;
  /** Called when "video clip" is selected. */
  onSelectVideoClip: () => void;
  /** Called when "cancel" is tapped or modal is dismissed. */
  onCancel: () => void;
};

/**
 * Modal chooser for screenshot vs video clip format.
 * Styled consistently with ExportProgressModal.
 */
export const FormatPickerModal = ({
  visible,
  title,
  onSelectScreenshot,
  onSelectVideoClip,
  onCancel,
}: FormatPickerModalProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
      supportedOrientations={['portrait', 'landscape']}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Pressable style={styles.closeButton} onPress={onCancel}>
            <Ionicons name="close" size={16} color="#fff" />
          </Pressable>

          <Text style={styles.titleText}>{title}</Text>

          <View style={styles.optionsContainer}>
            <Pressable style={styles.optionButton} onPress={onSelectScreenshot}>
              <Ionicons name="image-outline" size={22} color="#fff" />
              <Text style={styles.optionText}>screenshot</Text>
            </Pressable>

            <Pressable style={styles.optionButton} onPress={onSelectVideoClip}>
              <Ionicons name="videocam-outline" size={22} color="#fff" />
              <Text style={styles.optionText}>video clip</Text>
            </Pressable>
          </View>
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
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    gap: 16,
    minWidth: 280,
    maxWidth: 340,
    width: 300,
  },
  titleText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 17,
    textTransform: 'lowercase' as const,
  },
  optionsContainer: {
    width: '100%' as const,
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    width: '100%' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
  },
  optionText: {
    fontFamily: theme.fontFamily.bodySemiBold,
    color: theme.colors.text,
    fontSize: 15,
    textTransform: 'lowercase' as const,
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
}));
