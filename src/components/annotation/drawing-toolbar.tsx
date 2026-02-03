import { StyleSheet, View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DrawingTool } from '@/src/types/annotation';

type AnglePhase = 'idle' | 'first-ray' | 'second-ray';

type ToolOption = {
  tool: DrawingTool;
  icon: keyof typeof Ionicons.glyphMap;
};

const TOOL_OPTIONS: ToolOption[] = [
  { tool: 'freehand', icon: 'pencil-outline' },
  { tool: 'straight-line', icon: 'remove-outline' },
  { tool: 'angle', icon: 'analytics-outline' },
];

const ANGLE_PHASE_HINTS: Record<AnglePhase, string | null> = {
  idle: null,
  'first-ray': 'Drag first ray',
  'second-ray': 'Drag second ray',
};

type DrawingToolbarProps = {
  /** Currently selected color. */
  activeColor: string;
  /** Available preset colors. */
  presetColors: readonly string[];
  /** Whether there are annotations to undo. */
  canUndo: boolean;
  /** Currently active drawing tool. */
  activeTool: DrawingTool;
  /** Current angle drawing phase. */
  anglePhase: AnglePhase;
  /** Called when a color swatch is tapped. */
  onColorSelect: (color: string) => void;
  /** Called when undo is tapped. */
  onUndo: () => void;
  /** Called when clear is tapped. */
  onClear: () => void;
  /** Called when a tool is selected. */
  onToolSelect: (tool: DrawingTool) => void;
};

/**
 * Compact toolbar for annotation drawing controls.
 * Displays tool selection, color swatches, undo, and clear buttons.
 * Shows a hint during angle measurement phases.
 */
export const DrawingToolbar = ({
  activeColor,
  presetColors,
  canUndo,
  activeTool,
  anglePhase,
  onColorSelect,
  onUndo,
  onClear,
  onToolSelect,
}: DrawingToolbarProps) => {
  const phaseHint = ANGLE_PHASE_HINTS[anglePhase];

  return (
    <View style={styles.container}>
      {/* Tool selection row */}
      <View style={styles.toolRow}>
        {TOOL_OPTIONS.map(({ tool, icon }) => (
          <Pressable
            key={tool}
            onPress={() => onToolSelect(tool)}
            style={[
              styles.toolButton,
              activeTool === tool && styles.toolButtonActive,
            ]}
          >
            <Ionicons
              name={icon}
              size={20}
              color={activeTool === tool ? '#fff' : '#aaa'}
            />
          </Pressable>
        ))}
      </View>

      {/* Color swatches + actions */}
      <View style={styles.mainRow}>
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

      {/* Angle phase hint */}
      {phaseHint && (
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>{phaseHint}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(18, 18, 31, 0.9)',
    gap: 8,
  },
  toolRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  toolButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toolButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  hintRow: {
    alignItems: 'center',
  },
  hintText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
});
