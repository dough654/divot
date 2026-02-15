# Swing Detection: Evolution of Approaches

How we went from hard-coded pose rules to frame differencing to a trained classifier, and why each approach failed or succeeded.

## Approach 1: Pose-Based Rules (Deprecated)

**Idea**: Use native pose estimation (Apple Vision on iOS, ML Kit on Android) to detect address position and swing via hard-coded geometry checks — wrist proximity, stillness thresholds, shoulder-over-toes, knee bend angles.

**What worked**:
- Pose overlay rendering was solid — joint positions displayed correctly on the camera preview
- The 14-joint normalization layer (`pose-normalization.ts`) cleanly abstracted platform differences
- VisionCamera frame processor plugin pattern proved reliable for native→JS data flow

**What failed**:
- **Apple Vision confidence bouncing**: Wrist confidence oscillated 0.0→0.6→0.0 even when standing still. Confidence 0.0 returned garbage positions, so filtering by confidence discarded most frames.
- **Lower body dropout**: Knees and ankles were the most frequently lost joints at address — not a framing issue (full body visible), but Apple Vision's weakness on side-view poses with leg-behind-leg occlusion.
- **Hip Y noise**: Hip joint Y coordinate oscillated 0.02→0.45 normalized between frames. Any hip-relative check was unreliable.
- **Geometry checks too brittle**: Shoulder-over-toes and knee bend both depend on the weakest joints (knee, ankle). Adding EMA smoothing helped somewhat but couldn't overcome fundamental data quality issues.
- **Platform differences**: Apple Vision (19 joints) and ML Kit (33 joints) had different accuracy characteristics. Rules tuned for one platform didn't transfer.

**Outcome**: Abandoned pose-based swing detection. Kept pose overlay as a visual feature behind a feature flag.

## Approach 2: Frame Differencing + Audio Impact (Current)

**Idea**: Skip the noisy pose data entirely. Detect swings from raw pixel changes: luminance-based frame diff measures "how much the scene moved." Combine with audio metering to confirm impact. State machine: idle → still → armed → swing → cooldown.

**What worked**:
- Much simpler pipeline — no pose model dependency for detection
- Native frame diff module is fast and lightweight
- Audio impact detection adds good confirmation signal
- State machine design is sound (forward-only during swing, timeout reset)

**What failed**:
- **Signal too small and variable**: Analyzed 3 real range sessions (~92 minutes total). Swing motion peaks ranged from 0.01 to 0.09 depending on camera distance, lighting conditions, and background activity.
- **Fixed thresholds can't generalize**: A threshold that works at 8 feet doesn't work at 15 feet. A threshold for bright sun doesn't work for overcast. Wind-blown flags or other golfers in background create noise.
- **No semantic understanding**: Frame differencing can't distinguish a golf swing from someone walking through the frame, adjusting their hat, or a practice swing vs real swing.
- **Sensitivity slider is a band-aid**: Exposed a 0-1 sensitivity setting that maps to the swing threshold. Users shouldn't have to tune detection sensitivity.

**Outcome**: Works in controlled conditions but not robust enough for general use. Keeping the module for debug overlay visualization.

## Approach 3: MediaPipe Pose + Trained 1D CNN Classifier (New)

**Idea**: Replace native pose estimation with MediaPipe Pose (same model on all platforms), then train a temporal CNN classifier on labeled swing data to recognize swing phases from joint trajectories.

### Why MediaPipe over Apple Vision / ML Kit

| Factor | Apple Vision / ML Kit | MediaPipe Pose |
|--------|----------------------|----------------|
| Cross-platform consistency | Different models, different accuracy | Same BlazePose model everywhere |
| Training data alignment | Can't run Apple Vision offline on training videos | Same model for training data extraction AND on-device inference |
| Keypoint count | 19 (iOS) / 33 (Android) | 33 always |
| Confidence stability | Bouncing 0.0→0.6→0.0 (documented) | More stable (battle-tested) |
| Golf side-view performance | Weak lower body | Better full-body tracking |

The critical advantage is eliminating **train/inference distribution shift**. If we train a classifier on pose data extracted by MediaPipe, and then run MediaPipe at inference time, the model sees the same kind of noise/dropout patterns it was trained on. With Apple Vision, we'd need Apple hardware to extract training data, and the noise characteristics differ from ML Kit on Android.

### Why a trained classifier over rules

Hard-coded rules assume clean data. A model trained on noisy data learns to work around confidence drops and joint dropout. It learns the *temporal shape* of a swing — the coordinated movement pattern across multiple joints over time — rather than checking individual thresholds.

### Architecture

```
Input:  (30, 16) — 30 frames x 8 joints x 2 coords (x,y)
        Joints: shoulders, elbows, wrists, hips (skip noisy knees/ankles)

Conv1D(16->32, kernel=5) + ReLU + BatchNorm
Conv1D(32->64, kernel=5) + ReLU + BatchNorm
Conv1D(64->64, kernel=3) + ReLU + BatchNorm
GlobalAveragePooling1D
Dense(64->32) + ReLU + Dropout(0.3)
Dense(32->7) + Softmax

Output: 7 classes [idle, address, backswing, downswing, impact, follow_through, finish]
~16K params, ~64KB as JSON weights, <0.5ms inference in JS
```

**Why 1D CNN**: Captures temporal patterns in sliding windows. No hidden state complexity (vs LSTM). Much simpler than a Transformer for a 30-frame window. Proven architecture for time-series classification.

**Why JS inference**: 16K parameters is tiny. JS overhead is negligible at 10Hz polling. Avoids native rebuild cycles during model tuning. Enables OTA model updates. Can move to native TFLite/CoreML later if needed.

### Training Data

- **GolfDB**: ~1,400 annotated broadcast swings. Filter to DTL (down-the-line) real-time clips (~300 usable). Each has frame-level annotations for 8 swing events that map to our 7 phases.
- **Range session videos**: 3 existing recordings from real practice sessions. Provide realistic camera angles, lighting, and negative examples (walking, talking, practice swings).
- **Same model extraction**: Run MediaPipe Pose on all training videos to extract joint trajectories. The classifier trains on the same noisy data it will see at runtime.

### Integration

The native module interface stays unchanged — `PoseDetectorPlugin` still returns 42 doubles (14 joints x 3 values). Only the internal detector implementation changes from Apple Vision/ML Kit to MediaPipe. The JS classifier hook (`useSwingClassifier`) replaces `useMotionSwingDetection` in the camera screen, consuming pose data from the same `usePoseDetection` hook.

## File Lineage

| File | Approach 1 | Approach 2 | Approach 3 |
|------|-----------|-----------|-----------|
| `AppleVisionPoseDetector.swift` | Created | Unchanged | **Replaced** by `MediaPipePoseDetector.swift` |
| `MLKitPoseDetector.kt` | Created | Unchanged | **Replaced** by `MediaPipePoseDetector.kt` |
| `use-motion-detection.ts` | N/A | Created | Kept for debug |
| `use-motion-swing-detection.ts` | N/A | Created | Kept as legacy fallback |
| `use-swing-classifier.ts` | N/A | N/A | **New** |
| `swing-classifier.ts` | N/A | N/A | **New** — pure forward pass |
| `detection-debug-overlay.tsx` | N/A | Created | **Updated** for classifier output |
