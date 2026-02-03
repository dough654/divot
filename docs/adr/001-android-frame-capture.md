# ADR 001: Android Frame Capture via SVG toDataURL

## Status

Accepted

## Context

The annotation system needs to export annotated video frames (video thumbnail + SVG drawing overlay) as a single PNG image saved to the device gallery.

On iOS, `captureRef` from `react-native-view-shot` works correctly — it captures the entire view hierarchy including SVG content rendered by `react-native-svg`.

On Android, this approach fails for two reasons:

1. **Android's hardware renderer skips SVG content.** `captureRef` ultimately calls `view.draw(canvas)`, which does not invoke `Canvas.drawPicture()` — the mechanism `react-native-svg` uses to render. The resulting image contains the video thumbnail but no annotations.

2. **`captureRef` cannot see dynamically added Image components.** The `StaticAnnotationOverlay` and its background `Image` are mounted after the initial render (during the save flow). On Android, `captureRef` on certain view hierarchies does not pick up these late-added components, producing a blank or incomplete capture.

## Decision

On Android, bypass `captureRef` entirely. Instead:

1. Extract the current video frame as a base64 JPEG thumbnail (`expo-video-thumbnails`).
2. Embed that thumbnail as an SVG `<Image>` element inside `StaticAnnotationOverlay`, rendered behind the annotation paths.
3. Call `toDataURL()` on the SVG ref to produce a fully composited base64 PNG.
4. Write the base64 PNG to a temp file and save it to the gallery via `expo-media-library`.

On iOS, continue using the existing `captureRef` approach, which correctly captures both the `Image` component and SVG overlay in a single pass.

Platform selection happens in the `useEffect` capture phase in `video-player.tsx`, gated by `Platform.OS === 'android'`.

## Consequences

- **Platform-specific code paths** in the save flow. The Android and iOS branches in the capture `useEffect` share no capture logic, only the surrounding state management (confirmation dialog, thumbnail extraction, success/error feedback).
- **Android output resolution is limited.** `toDataURL()` renders at the SVG viewport size, which matches the container dimensions in device-independent pixels (DIPs). This is typically lower than the video's native resolution. iOS `captureRef` can produce higher-resolution output.
- **Two-phase render pattern required.** The save flow uses a `pendingCapture` ref and a `useEffect` to split the operation: phase 1 (in the Alert callback) sets state to hide the toolbar and mount the static overlay; phase 2 (in the effect) runs after React re-renders, ensuring the SVG is actually in the tree before capture begins.
- **Additional wait logic on Android.** After the SVG layout callback fires, the capture waits for extra animation frames and a 200ms timeout to ensure the native SVG renderer and image decoder have finished before calling `toDataURL()`.
