# On-Device ML Analysis

Real-time and post-swing analysis using on-device ML models for pose estimation, club path tracking, and swing phase detection. All inference runs locally — no server required.

## Problem

Divot streams live video between two devices, but the video is passive — users get no automated feedback about their swing. Golfers currently need a coach or trained eye to spot issues like poor posture, incorrect club path, or timing problems. We can add meaningful analysis using models that run directly on the phone.

## Design Principles

1. **Everything runs on-device.** No ML inference servers. Models run on the Neural Engine (iOS) or NNAPI (Android). This keeps latency low and works offline.
2. **Cross-platform pose with MediaPipe.** MediaPipe Pose Landmarker (BlazePose) replaces platform-specific Apple Vision/ML Kit for pose estimation. Same model everywhere eliminates train/inference distribution shift for the swing classifier.
3. **Trained classifier over hard-coded rules.** A 1D CNN trained on real swing data replaces hand-tuned thresholds. The model learns to handle noisy joint data, confidence drops, and joint dropout.
4. **Graceful degradation on lower-end devices.** If the hardware can't keep up, disable ML overlays but still record — analysis can run on the clip afterward at reduced speed.

## Three ML Layers

| Layer | What It Detects | Model | Runs On | Output |
|-------|----------------|-------|---------|--------|
| **Pose Estimation** | 33 body joint positions | MediaPipe Pose Landmarker (BlazePose) | Neural Engine / NNAPI | 14 joint coordinates per frame (mapped from 33) |
| **Club Tracking** | Club head, shaft, grip keypoints | Custom YOLOv8-nano (CoreML + TFLite) | Neural Engine / NNAPI | Club keypoint coordinates per frame |
| **Swing Phase Classification** | 7 swing phases (idle → finish) | 1D Temporal CNN (~16K params) | JS (CPU) | Phase label + confidence per window |

Pose estimation + club tracking run per-frame in native code. Swing phase classification runs in JavaScript on a sliding window of joint trajectories at ~10Hz.

## Layer 1: Pose Estimation

### MediaPipe Pose Landmarker

Replaced platform-specific Apple Vision (iOS) and ML Kit (Android) with MediaPipe Pose Landmarker on both platforms. See [swing-detection-evolution.md](./swing-detection-evolution.md) for why.

**Key advantages:**
- Same BlazePose model on iOS and Android — consistent accuracy characteristics
- 33 landmarks (superset of both Apple Vision's 19 and our 14-joint model)
- Same model runs offline during training data extraction AND on-device — no distribution shift
- Battle-tested on mobile, well-maintained by Google

**Integration:**
- iOS: `MediaPipeTasksVision` pod (~0.10.14), `pose_landmarker_lite.task` bundled as resource
- Android: `com.google.mediapipe:tasks-vision:0.10.14`, model in `assets/`
- Both map 33 MediaPipe landmarks → 14 joints matching our app's common model

### Cross-Platform Normalization

MediaPipe returns 33 landmarks. We map to our common 14-joint `PoseFrame` type:

```ts
type JointName =
  | 'nose' | 'neck'
  | 'leftShoulder' | 'rightShoulder'
  | 'leftElbow' | 'rightElbow'
  | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip'
  | 'leftKnee' | 'rightKnee'
  | 'leftAnkle' | 'rightAnkle';

type JointPosition = {
  x: number;  // normalized 0-1
  y: number;  // normalized 0-1
  confidence: number;  // 0-1
};

type PoseFrame = {
  timestamp: number;
  joints: Record<JointName, JointPosition>;
};
```

The 14 joints listed above are the intersection of both frameworks. ML Kit's extra landmarks (fingers, toes, face) are available on Android but not relied on for core analysis.

### What Pose Estimation Gives Us

- **Joint angles:** Knee bend at address, hip rotation at impact, spine angle throughout swing. Computed with `atan2` from three joint positions — pure math, no ML needed.
- **Wrist path as club proxy:** Even without the custom club model, wrist trajectory approximates the swing plane. Gets ~80% of the way to club path.
- **Posture checks:** Spine angle consistency, head movement, weight shift (hip position relative to feet).

## Layer 2: Club Tracking

### Training Data

Two Roboflow datasets are candidates:

**[Golf Club Tracking Dataset](https://universe.roboflow.com/club-head-tracking/golf-club-tracking/dataset/2):**
- 6,750 annotated images
- Club head bounding box detection
- Exportable to CoreML, TFLite, YOLO formats

**[Golf Club Pose Keypoints](https://universe.roboflow.com/golfswing-e1qwd/golf_club_pose):**
- Keypoint detection (grip, shaft, head positions)
- More precise than bounding boxes for path tracing
- Preferred for drawing smooth club arcs

### Model

YOLOv8-nano trained on the club keypoint dataset:

- ~3MB model size (acceptable for mobile bundle)
- ~5ms inference on Neural Engine / NNAPI
- Export to CoreML (iOS) and TFLite (Android) from the same trained weights
- Can run alongside native pose estimation within frame budget

### What Club Tracking Gives Us

- **Club path trace:** Connect club head positions across frames to draw the swing arc. Overlay on recorded video during playback.
- **Club head speed:** Distance between club head positions across frames × frame rate = approximate speed at any point in the swing.
- **Swing plane angle:** Fit a plane to the 3D club path (using estimated depth from 2D positions + body reference points). Compare to ideal swing plane.
- **Impact position:** Club head location at the moment of ball contact.

### High Frame Rate Capture

Club tracking benefits significantly from 240fps capture:

- At 30fps, the club head moves ~4 feet between frames during the downswing — too sparse for a smooth path
- At 240fps, the club head moves ~6 inches between frames — smooth, traceable arc
- VisionCamera supports 240fps on modern phones
- ML inference doesn't need to run on every frame — run on every 2nd or 4th frame and interpolate

## Layer 3: Swing Phase Classification

### Trained 1D Temporal CNN

Replaced the planned SwingNet integration (full-video RNN) with a lightweight 1D CNN that classifies swing phases in real-time from a sliding window of joint trajectories.

**Architecture:**
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

**Why this architecture:**
- 1D CNN captures temporal patterns in joint trajectories without stateful complexity (vs LSTM)
- 30-frame window at ~10Hz covers the full swing arc
- 8 upper-body joints avoid the noisy knee/ankle data that plagued the rule-based approach
- Runs in pure TypeScript (Float32Array math) — no native ML runtime needed
- Enables OTA model updates via JS bundle

**Training data:**
- GolfDB DTL real-time clips (~300 usable) with frame-level event annotations
- Range session recordings (3 videos) for realistic conditions + negative examples
- All training data extracted with the same MediaPipe model used at inference time

**Training pipeline:** `scripts/train-swing-classifier/`
- `download-golfdb-videos.py` — filter + download YouTube clips
- `extract-poses.py` — run MediaPipe on all frames, save CSVs
- `prepare-dataset.py` — sliding windows, label from events, balance classes
- `train.py` — PyTorch 1D CNN, early stopping, best checkpoint
- `export-weights.py` — convert to JSON/TypeScript for JS inference

### Phase Transition State Machine

The classifier outputs per-window predictions. A state machine smooths transitions and enforces swing physics:

```
idle ──[address 5+ frames]──→ address
address ──[backswing]──→ backswing  (emit swingStarted)
backswing → downswing → impact → follow_through → finish  (forward-only)
finish ──[idle 3+ frames]──→ idle  (emit swingEnded)
any ──[idle 10+ frames]──→ idle  (timeout/reset)
```

During an active swing (backswing→finish), transitions only go forward. This prevents classifier flicker from causing phase regression.

### What Swing Phases Give Us

- **Real-time swing detection:** Automatically detect when a swing starts/ends for rolling buffer capture
- **Tempo analysis:** Time between address and impact (backswing + downswing duration)
- **Key frame extraction:** Pull the most important frames for review
- **Phase-specific angle analysis:** Combine with pose estimation for "hip rotation at the top" etc.
- **Address detection:** Know when the golfer is set up (for club plane line display, buffer arming)

## Architecture

### Processing Pipeline

```
Recorded Clip (240fps)
        │
        ├──► Swing Phase Detection (SwingNet)
        │         │
        │         ▼
        │    Event Timestamps
        │    [address: f12, top: f89, impact: f134, ...]
        │
        ├──► Pose Estimation (Apple Vision / ML Kit)
        │         │
        │         ▼
        │    PoseFrame[] (joint positions per frame)
        │
        ├──► Club Tracking (YOLOv8-nano)
        │         │
        │         ▼
        │    ClubFrame[] (club keypoints per frame)
        │
        └──► Angle & Metric Computation (pure TypeScript)
                  │
                  ▼
             SwingAnalysis {
               phases: PhaseTimestamp[],
               poseFrames: PoseFrame[],
               clubFrames: ClubFrame[],
               metrics: {
                 tempo: { backswing: ms, downswing: ms, ratio: number },
                 angles: { hipRotationAtTop: deg, spineAngleAtImpact: deg, ... },
                 clubPath: { points: Point[], speedAtImpact: mph, swingPlane: deg },
               }
             }
```

### Where Each Model Runs

**Camera device** (the one filming):
- Pose estimation in real-time via VisionCamera frame processor (for live feedback if enabled)
- Records 240fps video for later analysis

**Either device** (camera or viewer, after recording):
- All three models run on the recorded clip
- Results are computed locally and displayed in playback UI
- Could transfer analysis results over the data channel alongside the clip

### Hook Structure

```
src/hooks/
  use-pose-estimation.ts      # Runs Apple Vision / ML Kit per frame
  use-club-tracking.ts        # Runs YOLOv8 club model per frame
  use-swing-analysis.ts       # Orchestrates all three layers on a recorded clip
```

```
src/utils/
  angle-calculation.ts        # Pure math: joint angles from positions
  swing-metrics.ts            # Tempo, speed, plane calculations
  pose-normalization.ts       # Apple Vision ↔ ML Kit joint mapping
```

### Native Module Extensions

The existing VisionCamera frame processor plugin pattern supports running custom models. We need:

**iOS — CoreML integration:**
- Load `.mlmodel` files bundled with the app
- Run inference in the frame processor callback
- Return structured results to JS

**Android — TFLite integration:**
- Load `.tflite` files from assets
- Run inference via NNAPI delegate
- Return structured results to JS

Both follow the same pattern as the existing `vision-camera-webrtc-bridge` native module.

## Device Capability & Graceful Degradation

| Capability | High-end (2022+) | Mid-range | Low-end |
|-----------|-------------------|-----------|---------|
| Real-time pose overlay | Yes | Yes (base model) | No |
| Real-time club tracking | Yes | Reduced FPS | No |
| Post-swing pose analysis | Yes | Yes | Yes (slower) |
| Post-swing club tracking | Yes | Yes | Yes (slower) |
| Swing phase detection | Yes | Yes | Yes |

Detection at runtime:
- Check Neural Engine / NNAPI availability
- Benchmark a single inference pass on app launch
- Store capability tier, use it to enable/disable real-time features
- Post-swing analysis always available (no time pressure, can run slower)

## Implementation Phases

### Phase 1: Pose Estimation + Angle Calculation

Add native pose estimation to the camera frame processor. Compute and display joint angles on recorded clips.

- Integrate Apple Vision pose detection in iOS frame processor
- Integrate ML Kit pose detection in Android frame processor
- Build `pose-normalization.ts` for cross-platform joint mapping
- Build `angle-calculation.ts` for computing angles from joint positions
- Display joint overlay on recorded clip playback
- Show key angles (knee bend, hip rotation, spine angle) as metrics

### Phase 2: Swing Phase Detection

Integrate SwingNet for automatic swing segmentation.

- Port SwingNet model to CoreML and TFLite
- Build `use-swing-analysis.ts` hook
- Auto-detect key frames in recorded clips
- Display phase markers on playback timeline
- Show tempo metrics (backswing/downswing ratio)

### Phase 3: Club Tracking

Train and deploy YOLOv8-nano for club keypoint detection.

- Train YOLOv8-nano on Roboflow club keypoint dataset
- Export to CoreML + TFLite
- Integrate into frame processor (post-swing analysis first)
- Draw club path trace on playback
- Calculate club head speed at impact

### Phase 4: Real-Time Overlays

Move from post-swing to real-time feedback on the camera device.

- Run pose estimation live in frame processor
- Display real-time joint angle feedback
- Add club tracking to live preview (if device supports it)
- Performance profiling and optimization

## Open Questions

1. **240fps recording + ML analysis battery impact.** Need to measure actual drain on target devices. May want to limit high-FPS capture to a set duration or make it opt-in.
2. **SwingNet model size and accuracy.** The published model targets trimmed golf swing videos. Need to evaluate whether it works well on raw phone footage with varying angles and backgrounds.
3. **Club keypoint dataset quality.** The Roboflow datasets are community-contributed. May need to augment with our own annotated footage for better accuracy in our specific camera angles (behind, face-on, down-the-line).
4. **Metric calibration.** Club head speed in mph requires knowing the real-world scale of the scene. Could use the golfer's height as a reference measurement (user enters their height once).

## References

- [Golf Club Tracking Dataset (6,750 images)](https://universe.roboflow.com/club-head-tracking/golf-club-tracking/dataset/2)
- [Golf Club Pose Keypoints](https://universe.roboflow.com/golfswing-e1qwd/golf_club_pose)
- [GolfDB / SwingNet](https://github.com/wmcnally/golfdb)
- [GolfPose Paper (ICPR 2024)](https://minghanlee.github.io/papers/ICPR_2024_GolfPose.pdf)
- [GolfPoseNet (2025)](https://www.researchgate.net/publication/389114267_GolfPoseNet_Golf-Specific_3D_Human_Pose_Estimation_Network)
- [Golf Driver Tracker (2,646 images)](https://universe.roboflow.com/salo-levy-nlqrn/golf-driver-tracker)
- [MMPose Toolbox](https://github.com/open-mmlab/mmpose)
