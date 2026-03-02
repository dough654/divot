import { StyleSheet, View, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DrawingTool } from '@/src/types/annotation';

type AnglePhase = 'idle' | 'first-ray' | 'second-ray';

type ToolOption = {
  tool: DrawingTool;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

const TOOL_OPTIONS: ToolOption[] = [
  { tool: 'freehand', icon: 'pencil-outline', label: 'Freehand draw' },
  { tool: 'straight-line', icon: 'remove-outline', label: 'Straight line' },
  { tool: 'angle', icon: 'analytics-outline', label: 'Angle measure' },
  { tool: 'ellipse', icon: 'ellipse-outline', label: 'Ellipse' },
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
  /** Whether there are annotations to redo. */
  canRedo: boolean;
  /** Currently active drawing tool. */
  activeTool: DrawingTool;
  /** Current angle drawing phase. */
  anglePhase: AnglePhase;
  /** Called when a color swatch is tapped. */
  onColorSelect: (color: string) => void;
  /** Called when undo is tapped. */
  onUndo: () => void;
  /** Called when redo is tapped. */
  onRedo: () => void;
  /** Called when clear is tapped. */
  onClear: () => void;
  /** Called when a tool is selected. */
  onToolSelect: (tool: DrawingTool) => void;
};

/**
 * Vertical sidebar toolbar for annotation drawing controls.
 * Stacks tool selection, color swatches, and undo/redo/clear
 * in a translucent pill on the right edge of the video.
 * Shows a floating hint during angle measurement phases.
 */
export const DrawingToolbar = ({
  activeColor,
  presetColors,
  canUndo,
  canRedo,
  activeTool,
  anglePhase,
  onColorSelect,
  onUndo,
  onRedo,
  onClear,
  onToolSelect,
}: DrawingToolbarProps) => {
  const phaseHint = ANGLE_PHASE_HINTS[anglePhase];

  return (
    <View style={styles.wrapper}>
      {/* Angle phase hint — floats to the left of the sidebar */}
      {phaseHint && (
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>{phaseHint}</Text>
        </View>
      )}

      <View style={styles.container}>
        {/* Tool selection */}
        <View style={styles.section} accessibilityRole="toolbar">
          {TOOL_OPTIONS.map(({ tool, icon, label }) => (
            <Pressable
              key={tool}
              onPress={() => onToolSelect(tool)}
              style={[
                styles.toolButton,
                activeTool === tool && styles.toolButtonActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: activeTool === tool }}
            >
              <Ionicons
                name={icon}
                size={24}
                color={activeTool === tool ? '#fff' : '#aaa'}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Color swatches */}
        <View style={styles.section} accessibilityRole="radiogroup" accessibilityLabel="Drawing colors">
          {presetColors.map((color) => (
            <Pressable
              key={color}
              onPress={() => onColorSelect(color)}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                activeColor === color && styles.colorSwatchActive,
              ]}
              accessibilityRole="radio"
              accessibilityLabel={`${color} color`}
              accessibilityState={{ checked: activeColor === color }}
            />
          ))}
        </View>

        <View style={styles.divider} />

        {/* Actions */}
        <View style={styles.section}>
          <Pressable
            style={[styles.actionButton, !canUndo && styles.actionButtonDisabled]}
            onPress={onUndo}
            disabled={!canUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            accessibilityState={{ disabled: !canUndo }}
          >
            <Ionicons name="arrow-undo" size={22} color={canUndo ? '#fff' : '#666'} />
          </Pressable>

          <Pressable
            style={[styles.actionButton, !canRedo && styles.actionButtonDisabled]}
            onPress={onRedo}
            disabled={!canRedo}
            accessibilityRole="button"
            accessibilityLabel="Redo"
            accessibilityState={{ disabled: !canRedo }}
          >
            <Ionicons name="arrow-redo" size={22} color={canRedo ? '#fff' : '#666'} />
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear all"
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  container: {
    backgroundColor: 'rgba(18, 18, 31, 0.85)',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
    alignItems: 'center',
  },
  section: {
    gap: 10,
    alignItems: 'center',
  },
  divider: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 4,
  },
  toolButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toolButtonActive: {
    borderColor: '#E5A020',
    backgroundColor: 'rgba(229, 160, 32, 0.2)',
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#E5A020',
    borderWidth: 3,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  hintPill: {
    backgroundColor: 'rgba(18, 18, 31, 0.85)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  hintText: {
    color: '#E5A020',
    fontSize: 13,
    fontWeight: '600',
  },
});
