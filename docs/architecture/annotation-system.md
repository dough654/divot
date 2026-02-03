# Annotation System Architecture

The annotation system lets users draw on paused video frames and export the annotated frame to their device gallery. It supports freehand drawing, straight lines, angle measurement, and ellipses.

## Overview

Four drawing tools are available:

| Tool | Description |
|------|-------------|
| **Freehand** | Free-form polyline following the user's finger |
| **Straight line** | Two-point line segment (drag start to end) |
| **Angle** | Two-ray angle measurement with arc and degree label (two sequential drags from a shared vertex) |
| **Ellipse** | Ellipse/circle shape (drag from one bounding-box corner to opposite corner) |

Annotations are drawn as SVG elements overlaid on the video. All coordinates are normalized to the 0–1 range, making annotations resolution-independent and portable across screen sizes.

## Type System

Defined in `src/types/annotation.ts`.

The annotation types use a discriminated union on the `type` field:

```
Point { x: number, y: number }           // Normalized 0–1

AnnotationLine {
  type: 'freehand' | 'straight-line'
  id: string
  points: Point[]                         // Polyline vertices
  color: string
  strokeWidth: number
}

AngleAnnotation {
  type: 'angle'
  id: string
  vertex: Point
  rayEndpointA: Point
  rayEndpointB: Point
  angleDegrees: number                    // 0–180, computed at creation
  color: string
  strokeWidth: number
}

EllipseAnnotation {
  type: 'ellipse'
  id: string
  center: Point
  radiusX: number                         // Half-width, normalized 0–1
  radiusY: number                         // Half-height, normalized 0–1
  color: string
  strokeWidth: number
}

Annotation = AnnotationLine | AngleAnnotation | EllipseAnnotation
```

`DrawingTool = 'freehand' | 'straight-line' | 'angle' | 'ellipse'`

## Component Architecture

```
VideoPlayer (src/components/playback/video-player.tsx)
├── Video                           # expo-av video playback
├── Image                           # Thumbnail overlay during capture (captureFrameUri)
├── DrawingOverlay                  # Interactive gesture + SVG layer
├── StaticAnnotationOverlay         # Non-interactive SVG for capture (mounted only during save)
└── DrawingToolbar                  # Tool/color/action buttons (hidden during save)

useDrawing (src/hooks/use-drawing.ts)
└── annotation-storage              # File-system persistence
```

### Data Flow

1. `useDrawing` manages all annotation state: the annotation list, current in-progress annotation, active tool, angle phase, and color.
2. `DrawingOverlay` captures pan gestures, normalizes touch coordinates to 0–1, and calls `useDrawing`'s `startLine` / `addPoint` / `endLine` callbacks.
3. `DrawingToolbar` provides UI for tool selection, color picking, undo, clear, and save. It reads state from `useDrawing` and triggers actions on it.
4. During save, `DrawingOverlay` and `DrawingToolbar` are unmounted and replaced by `StaticAnnotationOverlay`, which renders the same annotations non-interactively for capture.

### useDrawing Hook

`src/hooks/use-drawing.ts`

Core state management for annotations. Key behaviors:

- **Tool switching**: Setting a new `activeTool` cancels any in-progress angle measurement or ellipse drag.
- **Angle measurement phases**: Uses a three-phase state machine (`'idle'` → `'first-ray'` → `'second-ray'` → `'idle'`). Vertex and first ray endpoint are stored in refs to avoid stale closures in gesture callbacks.
- **Ellipse tool**: Drag from one bounding-box corner to the opposite. Center and radii are computed from the two corners (see `src/utils/ellipse-math.ts`). Ellipses with both radii below 0.01 (accidental taps) are discarded.
- **Undo/Redo**: Undo pops the last annotation onto a redo stack. Redo restores it. New commits clear the redo stack (no timeline branching). If an angle is in progress, undo cancels it instead. The redo stack is session-only and not persisted.
- **Auto-persistence**: Loads annotations from storage on mount; saves after every mutation (commit, undo, clear).
- **Defaults**: Stroke width 3, white color, preset palette `['#ffffff', '#f44336', '#ffeb3b', '#2196f3']`.

### DrawingOverlay

`src/components/annotation/drawing-overlay.tsx`

- Uses `react-native-gesture-handler`'s `Gesture.Pan()` with `minDistance(0)` and `runOnJS(true)`.
- Normalizes pixel coordinates via `onLayout` container dimensions, clamped to [0, 1].
- Renders SVG: `<Polyline>` for freehand, `<Line>` for straight lines, `<AngleAnnotationRenderer>` for angles, `<Ellipse>` for ellipses.
- Passes through touch events (`pointerEvents: 'none'`) when drawing is disabled.
- Appends `currentAnnotation` (in-progress) to `annotations` for live preview.

### StaticAnnotationOverlay

`src/components/annotation/static-annotation-overlay.tsx`

- `forwardRef` component exposing the `Svg` ref (needed for Android `toDataURL()`).
- Accepts optional `backgroundImageUri` to embed the video frame as an SVG `<Image>` behind annotation paths (Android capture path).
- Fires `onReady` callback after layout so the capture logic knows when to proceed.
- Same rendering logic as `DrawingOverlay` but with no gesture handling.

### AngleAnnotationRenderer

`src/components/annotation/angle-annotation-renderer.tsx`

Renders a complete angle annotation as an SVG `<G>` group:
- Two `<Line>` elements from vertex to each ray endpoint
- `<Path>` arc near the vertex (radius 20px), sweep direction determined by cross product
- `<Circle>` at the vertex
- `<SvgText>` degree label positioned via `computeAngleLabelPosition()` from `src/utils/angle-math.ts`

### DrawingToolbar

`src/components/annotation/drawing-toolbar.tsx`

Three-row layout:
1. Tool buttons (freehand, straight-line, angle, ellipse) with Ionicons
2. Color swatches (left) + action buttons (right): save, undo, redo, clear
3. Angle phase hint text (visible only during angle measurement)

## Storage

`src/services/annotation/annotation-storage.ts`

Annotations are persisted per clip using `expo-file-system`:

- **Location**: `{documentDirectory}/annotations/{clipId}_annotations.json`
- **Save**: Synchronous JSON write via `expo-file-system`'s `File` API.
- **Load**: Async read + JSON parse. Runs legacy migration (adds `type: 'freehand'` to annotations missing the field). Returns empty array on error or missing file.
- **Delete**: Removes the file if it exists, silently handles errors.

## Frame Capture & Export

The save-to-gallery flow is orchestrated in `video-player.tsx` with platform-specific capture strategies. See [ADR 001](../adr/001-android-frame-capture.md) for the full rationale behind the Android approach.

### Save Flow

1. User taps save in toolbar → confirmation `Alert` dialog.
2. On confirm: extract video thumbnail at current position (`expo-video-thumbnails`), read as base64.
3. **Phase 1** (Alert callback): Set `isSaving = true`, store base64 frame URI. This unmounts `DrawingOverlay`/`DrawingToolbar` and mounts `StaticAnnotationOverlay`.
4. **Phase 2** (`useEffect`, runs after re-render):

   **iOS path** — `captureRef` on the video container captures both the `Image` thumbnail and `StaticAnnotationOverlay` SVG in one shot. Result is saved to gallery via `expo-media-library`.

   **Android path** — The video frame is embedded as an SVG `<Image>` element inside `StaticAnnotationOverlay`. After waiting for SVG layout + extra animation frames (native renderer settling time), `toDataURL()` on the SVG ref produces a composited base64 PNG. That PNG is written to a temp file and saved to the gallery.

5. Clean up: remove `captureFrameUri`, reset `isSaving`, show success/error toast for 2 seconds.

### Two-Phase Render Pattern

The capture cannot happen in the Alert callback because React hasn't re-rendered yet — the toolbar is still mounted and the static overlay isn't in the tree. A `pendingCapture` ref bridges the two phases: the callback sets state and flips the ref, then a `useEffect` watching `isSaving` and `captureFrameUri` picks up the work after the DOM updates.

### Capture Services

`src/services/annotation/frame-capture.ts`

| Function | Platform | Description |
|----------|----------|-------------|
| `captureAnnotatedFrame(viewRef, options?)` | iOS | Calls `captureRef` → temp PNG → `MediaLibrary.createAssetAsync` → cleanup |
| `saveBase64ImageToGallery(base64Data)` | Android | Writes base64 to cache file → `MediaLibrary.createAssetAsync` → cleanup |

Both request media library permissions before saving and clean up temp files in `finally` blocks.

## Key Files

| File | Role |
|------|------|
| `src/types/annotation.ts` | Type definitions (Point, Annotation union, DrawingTool) |
| `src/hooks/use-drawing.ts` | State management, tool switching, angle phases, auto-persistence |
| `src/components/annotation/drawing-overlay.tsx` | Interactive gesture + SVG rendering layer |
| `src/components/annotation/drawing-toolbar.tsx` | Tool/color selection, undo/clear/save UI |
| `src/components/annotation/static-annotation-overlay.tsx` | Non-interactive SVG renderer for capture |
| `src/components/annotation/angle-annotation-renderer.tsx` | Angle arc + degree label SVG rendering |
| `src/services/annotation/annotation-storage.ts` | Per-clip annotation persistence via file system |
| `src/services/annotation/frame-capture.ts` | Platform-specific capture + gallery save |
| `src/components/playback/video-player.tsx` | Orchestrates the full annotation + capture flow |
| `src/utils/angle-math.ts` | Angle calculation and label positioning utilities |
| `src/utils/ellipse-math.ts` | Ellipse geometry computation from bounding-box corners |
