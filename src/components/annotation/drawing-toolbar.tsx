import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DrawingToolbarProps = {
  /** Currently selected color. */
  activeColor: string;
  /** Available preset colors. */
  presetColors: readonly string[];
  /** Whether there are lines to undo. */
  canUndo: boolean;
  /** Called when a color swatch is tapped. */
  onColorSelect: (color: string) => void;
  /** Called when undo is tapped. */
  onUndo: () => void;
  /** Called when clear is tapped. */
  onClear: () => void;
};

/**
 * Compact toolbar for annotation drawing controls.
 * Displays color swatches, undo, and clear buttons.
 */
export const DrawingToolbar = ({
  activeColor,
  presetColors,
  canUndo,
  onColorSelect,
  onUndo,
  onClear,
}: DrawingToolbarProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.colorRow}>
        {presetColors.map((color) => (
          <Pressable
            key={color}
            onPress={() => onColorSelect(color)}
            style={[
              styles.colorSwatch,
              { backgroundColor: color },
              activeColor === color && styles.colorSwatchActive,
            ]}
          />
        ))}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionButton, !canUndo && styles.actionButtonDisabled]}
          onPress={onUndo}
          disabled={!canUndo}
        >
          <Ionicons name="arrow-undo" size={20} color={canUndo ? '#fff' : '#666'} />
        </Pressable>

        <Pressable style={styles.actionButton} onPress={onClear}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(18, 18, 31, 0.9)',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
});
