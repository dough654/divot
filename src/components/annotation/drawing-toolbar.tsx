import { useState, useCallback } from 'react';
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
  /** Layout variant. Vertical = tall sidebar, grid = compact square. */
  layout?: 'vertical' | 'grid';
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
 * Toolbar for annotation drawing controls.
 * Vertical layout: tall sidebar pill (portrait).
 * Grid layout: 2-column × 4-row — tools left, color + actions right
 * (landscape).
 * Tapping the color button opens a floating popover with preset colors.
 * Shows a floating hint during angle measurement phases.
 */
export const DrawingToolbar = ({
  activeColor,
  presetColors,
  canUndo,
  canRedo,
  activeTool,
  anglePhase,
  layout = 'vertical',
  onColorSelect,
  onUndo,
  onRedo,
  onClear,
  onToolSelect,
}: DrawingToolbarProps) => {
  const phaseHint = ANGLE_PHASE_HINTS[anglePhase];
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const isGrid = layout === 'grid';

  const handleColorSelect = useCallback((color: string) => {
    onColorSelect(color);
    setColorPickerOpen(false);
  }, [onColorSelect]);

  const handleToolSelect = useCallback((tool: DrawingTool) => {
    setColorPickerOpen(false);
    onToolSelect(tool);
  }, [onToolSelect]);

  const handleUndo = useCallback(() => {
    setColorPickerOpen(false);
    onUndo();
  }, [onUndo]);

  const handleRedo = useCallback(() => {
    setColorPickerOpen(false);
    onRedo();
  }, [onRedo]);

  const handleClear = useCallback(() => {
    setColorPickerOpen(false);
    onClear();
  }, [onClear]);

  return (
    <View style={styles.wrapper}>
      {/* Angle phase hint — floats to the left of the toolbar */}
      {phaseHint && (
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>{phaseHint}</Text>
        </View>
      )}

      {/* Color picker popover — floats to the left of the toolbar */}
      {colorPickerOpen && (
        <View style={styles.colorPopover}>
          <View style={styles.colorGrid}>
            {presetColors.map((color) => (
              <Pressable
                key={color}
                onPress={() => handleColorSelect(color)}
                style={[
                  styles.popoverSwatch,
                  { backgroundColor: color },
                  activeColor === color && styles.popoverSwatchActive,
                ]}
                accessibilityRole="radio"
                accessibilityLabel={`${color} color`}
                accessibilityState={{ checked: activeColor === color }}
              />
            ))}
          </View>
        </View>
      )}

      {isGrid ? (
        /* Grid: two columns side by side — tools left, color+actions right */
        <View style={styles.containerGrid}>
          <View style={styles.gridColumn} accessibilityRole="toolbar">
            {TOOL_OPTIONS.map(({ tool, icon, label }) => (
              <Pressable
                key={tool}
                onPress={() => handleToolSelect(tool)}
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
          <View style={styles.gridColumn}>
            <Pressable
              onPress={() => setColorPickerOpen(!colorPickerOpen)}
              style={[
                styles.colorButton,
                { backgroundColor: activeColor },
                colorPickerOpen && styles.colorButtonOpen,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Choose drawing color"
            >
              <Ionicons
                name="color-palette"
                size={18}
                color={activeColor === '#ffffff' ? '#333' : '#fff'}
              />
            </Pressable>
            <Pressable
              style={[styles.actionButton, !canUndo && styles.actionButtonDisabled]}
              onPress={handleUndo}
              disabled={!canUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              accessibilityState={{ disabled: !canUndo }}
            >
              <Ionicons name="arrow-undo" size={22} color={canUndo ? '#fff' : '#666'} />
            </Pressable>
            <Pressable
              style={[styles.actionButton, !canRedo && styles.actionButtonDisabled]}
              onPress={handleRedo}
              disabled={!canRedo}
              accessibilityRole="button"
              accessibilityLabel="Redo"
              accessibilityState={{ disabled: !canRedo }}
            >
              <Ionicons name="arrow-redo" size={22} color={canRedo ? '#fff' : '#666'} />
            </Pressable>
            <Pressable
              style={styles.actionButton}
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Clear all"
            >
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        /* Vertical: single column with dividers */
        <View style={styles.container}>
          <View style={styles.section} accessibilityRole="toolbar">
            {TOOL_OPTIONS.map(({ tool, icon, label }) => (
              <Pressable
                key={tool}
                onPress={() => handleToolSelect(tool)}
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

          <Pressable
            onPress={() => setColorPickerOpen(!colorPickerOpen)}
            style={[
              styles.colorButton,
              { backgroundColor: activeColor },
              colorPickerOpen && styles.colorButtonOpen,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Choose drawing color"
          >
            <Ionicons
              name="color-palette"
              size={18}
              color={activeColor === '#ffffff' ? '#333' : '#fff'}
            />
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Pressable
              style={[styles.actionButton, !canUndo && styles.actionButtonDisabled]}
              onPress={handleUndo}
              disabled={!canUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              accessibilityState={{ disabled: !canUndo }}
            >
              <Ionicons name="arrow-undo" size={22} color={canUndo ? '#fff' : '#666'} />
            </Pressable>

            <Pressable
              style={[styles.actionButton, !canRedo && styles.actionButtonDisabled]}
              onPress={handleRedo}
              disabled={!canRedo}
              accessibilityRole="button"
              accessibilityLabel="Redo"
              accessibilityState={{ disabled: !canRedo }}
            >
              <Ionicons name="arrow-redo" size={22} color={canRedo ? '#fff' : '#666'} />
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Clear all"
            >
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Vertical container — tall column pill (portrait)
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
    alignItems: 'center',
  },
  // Grid container — two columns side by side (landscape)
  containerGrid: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 10,
  },
  // Single column within the grid
  gridColumn: {
    gap: 10,
    alignItems: 'center',
  },
  // Vertical section — stacked column
  section: {
    gap: 10,
    alignItems: 'center',
  },
  // Vertical divider — horizontal line
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
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  colorButtonOpen: {
    borderColor: '#E5A020',
    borderWidth: 3,
  },
  colorPopover: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    padding: 10,
    marginRight: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 84,
    gap: 8,
    justifyContent: 'center',
  },
  popoverSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  popoverSwatchActive: {
    borderColor: '#E5A020',
    borderWidth: 3,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  hintPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
