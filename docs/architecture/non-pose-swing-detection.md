# Non-Pose-Based Golf Swing Detection Research

Research into alternative computer vision and sensor techniques for detecting golf swings that do NOT rely on pose/skeleton estimation. The camera is stationary on a tripod filming a golfer.

## Problem Statement

Current implementation uses Apple Vision / ML Kit pose estimation for:
1. **Address detection** — golfer is set up and still, about to swing
2. **Swing detection** — wrist velocity from pose keypoints

### Current Limitations (from real device testing)

- **Wrist confidence bouncing**: 0.0→0.6→0.0 oscillation even when standing still. At 0.0, positions are garbage.
- **Lower body dropout**: Knees and ankles frequently lost, even with full body in frame
- **Hip Y instability**: Oscillates 0.02→0.45 normalized frame-to-frame
- **Side-view weakness**: Down-the-line golf pose (leg behind leg) causes occlusion issues

**Key insight**: Maybe we don't need to know WHERE body parts are to detect WHEN a swing happens. We just need to detect the motion pattern: **still → burst → still**.

---

## 1. Frame Differencing / Motion Energy

### Overview

Frame differencing detects motion by computing pixel-level changes between consecutive frames. **Stillness = low magnitude, sudden spike = swing.**

### How It Works

1. Subtract two consecutive frames → obtain frame difference
2. Convert to binary image (threshold pixel changes)
3. Sum total motion magnitude across the frame
4. Detect pattern: **low magnitude (address) → sudden spike (swing) → low magnitude (finish)**

### Golf Swing Applications

- **GolfDB research** mentions frame differencing as a baseline for swing event detection
- Simple threshold-based methods can detect swing initiation with ~0.003 seconds computation time (vs ML approaches that take significantly longer)

### Mobile Performance

**Pros:**
- **Extremely fast**: Simple arithmetic operations on pixel intensities
- **Low computational cost**: Ideal for embedded systems, IoT, low-power hardware
- **Responsive to immediate changes**: Reacts quickly without building long-term background model
- **Battery friendly**: Optimized frame differencing reduces energy consumption on mobile

**Cons:**
- **Sensitive to camera shake**: Even minor tripod movement triggers false positives
- **Illumination changes**: Lighting shifts, moving shadows cause false detections
- **Slow-moving objects**: Address position may still show small pixel changes (breathing, micro-movements)
- **Dynamic backgrounds**: Wind in trees, clouds, etc. add noise

### Implementation on React Native

**VisionCamera Frame Processor approach:**

```typescript
// Native plugin (Swift/Kotlin) using OpenCV or platform APIs
function computeFrameDifference(currentFrame, previousFrame) {
  // Grayscale conversion
  // Pixel-wise subtraction
  // Threshold and count changed pixels
  return motionMagnitude;
}

// JS side (VisionCamera frame processor)
const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  const magnitude = computeFrameDifference(frame);
  // Store magnitude in native static var
  // Poll from JS via setInterval (same pattern as pose detection)
}, []);
```

**OpenCV integration:** Possible via [native frame processors using OpenCV](https://medium.com/dogtronic/creating-native-frame-processors-for-vision-camera-in-react-native-using-opencv-e6b015005711) and [VisionCamera with OpenCV](https://medium.com/@botelhomarcelo7/visioncamera-with-react-native-frame-processor-plugin-yuv420-conversion-opencv-and-much-more-c0736bfdd154).

### Robustness vs Pose

**More robust than pose for:**
- Detecting WHEN motion happens (temporal signature)
- Ignoring joint dropout issues
- Running faster with less CPU/battery drain

**Less robust than pose for:**
- Distinguishing golf swing from other motions (walking into frame, practice swings)
- Detecting direction of motion (backswing vs downswing)
- Handling camera shake or background motion

### Could It Replace or Complement Pose?

**Replace address detection?**
- **Partially.** Stillness detection is strong — low frame difference over 1-2 seconds = golfer is still.
- **Problem:** Can't verify it's golf ADDRESS (hands together, bent over ball) vs just standing still.
- **Best use:** Complement pose. Use frame differencing for stillness gate, pose for geometry verification.

**Replace swing detection?**
- **Possibly.** Sudden spike in motion magnitude is a strong signal.
- **Problem:** Can't distinguish swing from other sudden movements (stepping back, adjusting stance).
- **Best use:** Primary trigger with lower threshold, pose velocity as confirmation.

### Recommended Path

1. **Prototype**: Build native frame processor plugin that computes frame difference magnitude
2. **Test**: Log magnitude during address and swing to find threshold values
3. **Integrate**: Use as a pre-filter before pose checks — if magnitude is flat, skip expensive pose geometry checks
4. **Fallback**: If pose wrists drop out during swing, fall back to frame differencing to end recording

---

## 2. Optical Flow

### Overview

Optical flow computes motion vectors between frames — tracks WHERE pixels are moving, not just that they're moving. Golf swing has a characteristic arc pattern.

### Types

**Sparse Optical Flow (Lucas-Kanade):**
- Tracks motion of a sparse set of feature points (e.g., corners detected via Shi-Tomasi)
- **Fast and lightweight** — favored for real-time video processing
- **Best for mobile**: Low computational load, speed over accuracy
- OpenCV: `cv.calcOpticalFlowPyrLK()`

**Dense Optical Flow (Gunnar Farneback):**
- Computes motion vector for every pixel in the frame
- **High accuracy, slow, computationally expensive**
- Not practical for real-time mobile without GPU acceleration

### Golf Swing Applications

- [**Optical-Flow and Human-Segmentation Based Method**](https://ieeexplore.ieee.org/iel8/10634322/10634595/10634681.pdf): Achieved **82.2% PCE** on GolfDB dataset for key event detection
- **SwingNet** (GolfDB research): Uses MobileNetV2 + LSTM, advocates for "computationally efficient models to promote in-the-field analysis via deployment on mobile devices"
- Optical flow + template matching used to track golfer body parts over time
- **Real-time speeds**: Up to 31 fps with optical flow integration

### Mobile Performance

**Pros:**
- **Pattern recognition**: Can detect characteristic swing arc pattern
- **Direction awareness**: Knows if motion is upward, downward, lateral
- **Better than frame diff**: Distinguishes types of motion, not just magnitude
- **Lucas-Kanade is mobile-friendly**: Low computational cost compared to dense methods

**Cons:**
- **More complex than frame diff**: Requires feature detection or full-frame computation
- **Still sensitive to camera shake**: Motion vectors include camera movement
- **Aperture problem**: Lucas-Kanade can fail on edges without texture

### Implementation on React Native / VisionCamera

**Native plugin with OpenCV:**

- [OpenCV Optical Flow tutorial](https://docs.opencv.org/3.4/d4/dee/tutorial_optical_flow.html)
- [Optical Flow in OpenCV (C++/Python)](https://learnopencv.com/optical-flow-in-opencv/)
- [Creating native frame processors for VisionCamera using OpenCV](https://medium.com/dogtronic/creating-native-frame-processors-for-vision-camera-in-react-native-using-opencv-e6b015005711)

**Example Android implementation:**
- [RobertYCXu/opticalflow-opencv-android](https://github.com/RobertYCXu/opticalflow-opencv-android): Converts real-time phone video into motion paths

**Performance:**
- Lucas-Kanade is "favored for applications that require speed and can tolerate approximate motion vectors, such as in real-time video processing"
- Dense optical flow "has higher accuracy at the cost of being slow/computationally expensive"

### Robustness vs Pose

**More robust than pose for:**
- Detecting motion patterns without needing joint localization
- Working through partial occlusion (tracks pixels, not body parts)
- Identifying swing direction and arc shape

**Less robust than pose for:**
- Semantic understanding (is this a golf swing or random arm motion?)
- Body stillness detection (pose can check torso anchor, optical flow sees all motion)

### Could It Replace or Complement Pose?

**Replace address detection?**
- **Partially.** Low optical flow magnitude = stillness. But can't verify golf-specific geometry.
- **Best use:** Complement pose for stillness verification.

**Replace swing detection?**
- **Strong candidate.** Characteristic upward arc pattern (backswing) + downward arc (downswing) is distinctive.
- **Advantage over pose:** Doesn't require wrist tracking — just needs to see motion in the region where the golfer stands.
- **Challenge:** Need to train/tune what the "golf swing arc" looks like in optical flow space.

### Recommended Path

1. **Prototype**: Sparse Lucas-Kanade optical flow via native plugin
2. **Characterize swing pattern**: Log flow vectors during swings, identify arc signature
3. **Pattern matching**: Detect upward burst → downward burst as swing trigger
4. **Hybrid approach**: Optical flow for motion pattern, pose for body position verification

---

## 3. Audio-Based Detection

### Overview

Detect the sound of club hitting ball. Very distinctive "crack" or "thwack" sound. Could work as a complementary signal to mark swing **impact**.

### Golf-Specific Implementations

**Commercial apps using audio/sensor fusion:**
- **Golfshot**: Auto shot tracking with "haptic and audio feedback that lets you know when a swing was successfully detected" (uses watch sensors + ML)
- **HackMotion**: Real-time audio feedback for wrist positions
- **Shot Tracer, GolfTrak, etc.**: Use visual AI, but audio could complement

**Research:**
- IMU + audio fusion mentioned in golf swing detection papers
- No open-source golf-specific audio detection libraries found

### Mobile Audio APIs

**React Native / Expo:**
- **expo-audio** ([docs](https://docs.expo.dev/versions/latest/sdk/audio/)): `useAudioRecorder` hook, metering support
- **expo-av** (legacy): Audio recording with loudness metering
- **react-native-voice** ([GitHub](https://github.com/react-native-voice/voice)): Microphone access for speech, but could be adapted for sound level monitoring
- **RNSoundLevel**: Real-time audio level monitoring

**Metering for sound detection:**
- `isMeteringEnabled` gives real-time sound level values
- Can poll metering data during recording to detect loud transient event (impact)

### Mobile Performance

**Pros:**
- **Very lightweight**: Audio processing is far cheaper than video
- **Distinctive signal**: Ball impact sound is unique and loud
- **No visual occlusion issues**: Works regardless of camera angle
- **Precise timing**: Impact is a clear event, useful for trimming video

**Cons:**
- **Environmental noise**: Wind, talking, other golfers, traffic
- **Distance to microphone**: Phone on tripod may be 10+ feet from ball
- **False positives**: Club hitting ground, practice swings that hit a tee, etc.
- **Won't detect address or swing start**: Only useful for marking impact

### Robustness vs Pose

**Not a replacement**: Audio only detects impact, not swing initiation or address.

**Strong complement**:
- Pose detects swing start → audio detects impact → pose detects follow-through
- Audio can confirm swing actually made contact (vs practice swing)

### Could It Replace or Complement Pose?

**Replace?** No. Audio is a single-point-in-time event, doesn't detect address or swing start.

**Complement?** **Yes, highly valuable:**
1. **Auto-trim videos to impact**: Detect impact sound → center video clip around that timestamp
2. **Confirm real swing vs practice swing**: If swing motion detected but no impact sound, it's a practice swing
3. **Shot tracking**: Impact sound can trigger ball flight tracking or shot logging

### Recommended Path

1. **Low priority for MVP**: Address and swing detection are more critical than impact detection
2. **Phase 2 feature**: Add audio metering during recording, detect impact transient
3. **Use for auto-trim**: Center saved clips around impact for easier review

---

## 4. Motion History Images (MHI) / Motion Energy Images (MEI)

### Overview

**Temporal templates** that encode motion information from a sequence of frames into a single grayscale image.

- **MEI**: Binary representation — shows WHERE motion occurred (1 = motion, 0 = no motion)
- **MHI**: Scalar-valued image — pixel intensity = recency of motion (brighter = more recent)

Classic computer vision technique (Bobick & Davis, MIT, 1990s) for action recognition.

### How It Works

1. **Build MHI**: For each pixel, intensity = how recently motion occurred at that location
2. **Extract features**: Compute HOG (Histogram of Oriented Gradients) or LBP (Local Binary Patterns) from MHI
3. **Classify action**: Match feature descriptor against templates for different actions (walk, run, golf swing, etc.)

**Motion History Histogram (MHH)**: More compact feature descriptor derived from MHI, useful for embedded devices.

### Golf Swing Applications

- [**Time-weighted MHI for sports classification**](https://link.springer.com/article/10.1007/s12283-023-00437-1): Sports-specific activity classification using MHI
- MHI is "simple but robust in representing movements and is widely employed for action recognition"
- [Multi-class activity classification using MHI generation](https://arxiv.org/html/2410.09902v1)

### Mobile Performance

**Pros:**
- **Computationally inexpensive**: MHI generation is simple (frame differencing + decay function)
- **Compact representation**: Single grayscale image instead of full video sequence
- **Embedded-friendly**: MHH (Motion History Histogram) designed for low gate count on FPGA
- **Real-time capable**: Runs at real-time speeds for action recognition
- **View-based**: Captures motion pattern from a specific camera angle (down-the-line golf view)

**Cons:**
- **Requires training**: Need to build a classifier (SVM, neural net) to recognize golf swing MHI pattern
- **Template matching**: Works best when camera angle is consistent
- **Not rotation/scale invariant**: MHI changes if golfer moves closer/farther from camera

### Implementation on React Native / VisionCamera

**Native plugin approach:**

```swift
// MHI builder (Swift/Kotlin)
class MotionHistoryBuilder {
  var mhi: CVPixelBuffer
  let decayRate: Float = 0.9

  func update(frame: CVPixelBuffer) {
    let diff = frameDifference(current: frame, previous: lastFrame)
    for pixel in mhi {
      if diff[pixel] > threshold {
        mhi[pixel] = 1.0  // Max recency
      } else {
        mhi[pixel] *= decayRate  // Decay over time
      }
    }
    lastFrame = frame
  }

  func getMHI() -> CVPixelBuffer { return mhi }
}

// JS side: poll MHI, compute features, classify
const isSwing = classifyMHI(builder.getMHI());
```

**Training data needed:**
- Golf swing videos → extract MHI → label as "swing"
- Non-swing videos (standing, practice swings, walking) → label as "not swing"
- Train simple classifier (k-NN, SVM, or small CNN)

### Robustness vs Pose

**More robust than pose for:**
- Capturing overall motion pattern without needing joint localization
- Working through partial occlusion
- Ignoring pose confidence dropout issues

**Less robust than pose for:**
- Semantic understanding (what part of body is moving)
- Directional information (is wrist moving up or down?)
- Immediate responsiveness (MHI accumulates over time, introduces lag)

### Could It Replace or Complement Pose?

**Replace address detection?**
- **Possibly.** Zero motion in MHI (all pixels decayed) = stillness. But can't verify golf geometry.
- **Best use:** Complement pose for stillness verification.

**Replace swing detection?**
- **Strong candidate.** MHI captures the temporal signature of swing motion.
- **Advantage:** Doesn't care about joint dropout — just needs to see motion in the golfer region.
- **Challenge:** Requires training a classifier on golf swing MHI patterns.

### Recommended Path

1. **Phase 2 exploration**: Not for MVP (requires training data collection)
2. **Collect swing data**: Record 50-100 swings + non-swing actions, extract MHI
3. **Train classifier**: Simple k-NN or SVM to recognize golf swing MHI pattern
4. **Hybrid system**: MHI for coarse swing detection, pose for fine-grained analysis

---

## 5. Simple Temporal Pattern (Still → Burst → Still)

### Overview

**No ML needed.** Just track "total frame change over time" and look for the signature:
- **Low activity** (stillness at address)
- **Spike** (swing motion)
- **Return to low** (finish)

This is essentially a simplified version of frame differencing focused purely on the temporal signature.

### How It Works

1. **Compute motion magnitude per frame** (via frame diff, optical flow magnitude, or pose velocity)
2. **Smooth over time** (sliding window average to reduce noise)
3. **State machine:**
   - `idle` → wait for sustained low activity
   - `address` → low activity confirmed (golfer is still)
   - `swing` → sudden spike above threshold
   - `finish` → return to low activity

### Golf Swing Research

**Threshold-based IMU methods:**
- [**Early Improper Motion Detection in Golf Swings**](https://pmc.ncbi.nlm.nih.gov/articles/PMC3715223/): "Beginning of swing is determined as point where golfer's arm stillness turns to motion"
- [**Golf swing motion detection using IMU**](https://ieeexplore.ieee.org/document/7521016/): Uses magnitude threshold of acceleration signal to classify backswing, downswing, follow-through
- **Simple heuristic methods**: ~0.003 seconds computation time (vs ML approaches that are much slower)

**This is essentially what the current pose-based implementation already does:**
- Address detection: checks geometry + stillness (low wrist velocity)
- Swing detection: spike in wrist velocity triggers recording

### Mobile Performance

**Pros:**
- **Extremely fast**: Simple arithmetic and threshold checks
- **Low latency**: No model inference, immediate response
- **No training needed**: Hand-tune thresholds on real data
- **Generalizes well**: Still→burst→still pattern is universal

**Cons:**
- **Requires robust motion signal**: Garbage-in, garbage-out
- **Sensitive to threshold tuning**: Too low = false positives, too high = missed swings
- **No semantic understanding**: Can't distinguish golf swing from other sudden movements

### Implementation

**Already implemented via pose wrist velocity:**
- `use-address-detection.ts`: Detects stillness via `computeBodyStillness` (low wrist displacement)
- `use-swing-auto-detection.ts`: Detects burst via `computeBodyRelativeWristVelocity` spike

**Could be re-implemented using frame differencing magnitude instead:**

```typescript
// Replace wrist velocity with frame diff magnitude
const magnitude = computeFrameDifference(frame);

// Same state machine logic
if (state === 'watching' && magnitude < stillnessThreshold) {
  confirmationCount++;
  if (confirmationCount >= requiredFrames) {
    state = 'in-address';
  }
}

if (state === 'in-address' && magnitude > swingThreshold) {
  state = 'swing-detected';
  startRecording();
}
```

### Robustness vs Pose

**More robust than pose for:**
- Not affected by joint dropout or confidence bouncing
- Faster computation (no pose inference)

**Less robust than pose for:**
- Can't verify it's a GOLF swing vs other motion
- No body-relative motion filtering (camera shake triggers false positives)

### Could It Replace or Complement Pose?

**Replace pose entirely?**
- **For swing detection: Yes, if using a robust motion signal** (frame diff, optical flow).
- **For address detection: Partially** — stillness detection works, but can't verify golf geometry (hands together, bent over ball).

**Best hybrid approach:**
1. **Use frame differencing or optical flow for motion magnitude**
2. **Use pose only when motion is detected** (save battery when golfer is idle)
3. **Cross-validate**: Frame diff says swing, pose confirms wrist motion direction

### Recommended Path

**This is the most practical non-pose approach to prototype first:**

1. **Add frame differencing magnitude** to existing VisionCamera plugin
2. **Log magnitude alongside pose velocity** during test swings
3. **Tune thresholds** for frame diff magnitude that match pose velocity triggers
4. **Implement fallback logic**:
   - If pose wrists available: use body-relative wrist velocity (current approach)
   - If pose wrists dropout: fall back to frame diff magnitude
5. **Test robustness**: Does frame diff reduce false negatives when wrists are lost?

---

## 6. Accelerometer/Gyroscope

### Overview

Use phone's onboard sensors (accelerometer, gyroscope) to detect motion.

**Problem:** Phone is on a stationary tripod. Phone sensors detect phone motion, not golfer motion.

### Golf Swing Applications

**When sensors are attached to the golfer or club:**
- **Apple Watch apps**: Detect swing via wrist-worn IMU ([SwingMonitorApp](https://github.com/robandrews/SwingMonitorApp))
- **Club-mounted sensors**: Accelerometer + gyroscope on club shaft ([validation research](https://link.springer.com/chapter/10.1007/978-0-387-46050-5_28))
- **Performance**: 94% accuracy for driver swings, 89% for iron swings with single IMU on club
- **Inertial Sensor Systems**: Most common motion capture for golf due to price, ease of use, accuracy

**When sensor is stationary (our case):**
- ❌ **Not useful for detecting golfer motion**
- ✅ **Could detect tripod vibration from ball impact** (if phone is close to mat/ground)
- ✅ **Could detect if tripod is bumped/moved** (trigger re-calibration or warning)

### Mobile Performance

**Pros (when attached to golfer/club):**
- Very fast, low power
- High accuracy for swing phase detection
- Works regardless of lighting or occlusion

**Cons (when phone is on tripod):**
- Phone doesn't move, golfer does — no useful signal
- Only detects vibrations transmitted through ground/tripod

### Could It Replace or Complement Pose?

**Replace?** No. Stationary phone sensors don't detect golfer motion.

**Complement?** Minimal value. Possible use cases:
- Detect ball impact vibration (low priority, audio is better)
- Detect tripod bump (trigger stabilization warning)

### Recommended Path

**Skip for now.** Not useful for stationary camera setup. Only relevant if building a wearable/watch app in the future.

---

## 7. Background Subtraction + Blob Tracking

### Overview

1. **Build background model** (stationary scene without golfer)
2. **Subtract background** from each frame → isolate moving foreground (golfer)
3. **Blob detection**: Find connected regions of foreground pixels
4. **Track blob motion**: Measure blob centroid displacement over time

Used widely in sports tracking: [tennis](https://www.researchgate.net/publication/283184656_Object_Detection_and_Tracking_Based_on_Trajectory_in_Broadcast_Tennis_Video), [beach volleyball](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111730), [football player tracking](https://www.ajer.org/papers/v6(11)/N061195104.pdf).

### How It Works

```
1. Capture background (empty frame before golfer enters)
2. For each frame:
   - Subtract background
   - Threshold to get foreground mask
   - Find blobs (BFS on connected pixels)
   - Track blob centroid over time
3. Detect swing:
   - Low blob motion = address
   - High blob motion = swing
```

### Golf Swing Applications

- [**Background subtraction for sports player detection**](https://www.ciitresearch.org/dl/index.php/dip/article/view/DIP092013007): "Analyze player activity and improve performance by detecting motion in video sequences"
- Traditional computer vision for sports: color filtering, background subtraction, blob detection widely used

### Mobile Performance

**Pros:**
- **Isolates golfer from background**: Reduces noise from trees, clouds, etc.
- **Simple blob motion is fast**: Centroid tracking is lightweight
- **Works with moving backgrounds**: Adaptive background models handle lighting changes

**Cons:**
- **Requires static camera**: Camera shake breaks background model
- **Initial calibration needed**: Must capture clean background frame
- **Clothing/lighting dependent**: Golfer wearing similar color to background causes dropout
- **Computational cost**: Adaptive background modeling (e.g., MOG2, KNN) is heavier than frame diff

### Implementation on React Native / VisionCamera

**Native plugin with OpenCV:**

```swift
// Swift/Kotlin using OpenCV
let bgSubtractor = BackgroundSubtractorMOG2()

func procesFrame(_ frame: CVPixelBuffer) {
  let fgMask = bgSubtractor.apply(frame)
  let blobs = findBlobs(fgMask)  // BFS connected components
  let centroid = computeCentroid(blobs)

  // Track centroid displacement
  let motion = distance(centroid, previousCentroid)
  return motion
}
```

**Algorithms:**
- `BackgroundSubtractorMOG2` (Gaussian Mixture Model)
- `BackgroundSubtractorKNN` (K-Nearest Neighbors)
- Both available in OpenCV, adaptable to lighting changes

### Robustness vs Pose

**More robust than pose for:**
- Ignoring background noise (trees, clouds, other people in distance)
- Tracking overall golfer motion without needing joint localization

**Less robust than pose for:**
- Semantic understanding (which part of golfer is moving)
- Working in dynamic environments (wind, shadows, people walking behind golfer)

### Could It Replace or Complement Pose?

**Replace address detection?**
- **Possibly.** Low blob motion = stillness. But can't verify golf geometry.
- **Problem:** Requires clean background capture. If golfer is already in frame when app starts, can't build background model.

**Replace swing detection?**
- **Possibly.** High blob motion = swing. Simpler than pose, no joint dropout issues.
- **Advantage:** Total body motion signal, not dependent on specific joints.

**Complement pose?**
- **Yes.** Use background subtraction to create a Region of Interest (ROI) for pose detection → run pose inference only on the golfer blob → faster, less noise.

### Recommended Path

1. **Phase 2 exploration**: Not for MVP (requires background calibration)
2. **Test as ROI optimization**: Use background subtraction to crop frame to golfer region before pose inference → reduce computation
3. **Fallback for swing detection**: If pose joints dropout, fall back to blob motion magnitude

---

## Summary Comparison Table

| Approach | Address Detection | Swing Detection | Mobile Performance | Implementation Complexity | Replaces Pose? | Complements Pose? |
|----------|-------------------|-----------------|-------------------|--------------------------|----------------|-------------------|
| **Frame Differencing** | ✅ Stillness (low diff) | ✅ Burst (high diff) | ⭐⭐⭐ Very fast, low power | ⭐ Very simple | Partially | ✅ Yes — stillness pre-filter |
| **Optical Flow** | ✅ Stillness (low flow) | ✅✅ Arc pattern | ⭐⭐ Fast (Lucas-Kanade) | ⭐⭐ Moderate (OpenCV) | Partially | ✅ Yes — pattern verification |
| **Audio Detection** | ❌ No | ❌ No (impact only) | ⭐⭐⭐ Very fast | ⭐ Simple | No | ✅ Yes — impact marking |
| **MHI/MEI** | ✅ Stillness (zero MHI) | ✅ Swing pattern | ⭐⭐ Moderate | ⭐⭐⭐ Requires training | Possibly | ✅ Yes — pattern classifier |
| **Simple Temporal** | ✅ Stillness | ✅ Burst | ⭐⭐⭐ Very fast | ⭐ Very simple | Yes (with robust signal) | ✅ Yes — fallback |
| **Accelerometer/Gyro** | ❌ No (stationary phone) | ❌ No | N/A | N/A | No | No |
| **Background Subtraction** | ✅ Low blob motion | ✅ High blob motion | ⭐⭐ Moderate | ⭐⭐ Moderate (OpenCV) | Partially | ✅ Yes — ROI optimization |

---

## Recommended Implementation Strategy

### Phase 1: Frame Differencing Fallback (Easiest Win)

**Goal:** Reduce false negatives when pose wrists dropout.

1. **Add frame differencing to VisionCamera plugin**
   - Compute motion magnitude per frame (grayscale pixel difference)
   - Store in native static var, poll from JS (same pattern as pose)

2. **Log magnitude alongside pose velocity**
   - Collect data from 20-30 test swings
   - Find magnitude thresholds that correspond to address stillness and swing burst

3. **Implement hybrid logic:**
   ```typescript
   // If pose wrists are valid, use body-relative velocity (current approach)
   if (wristConfidence > threshold) {
     motion = computeBodyRelativeWristVelocity(pose);
   }
   // If wrists dropout, fall back to frame differencing
   else {
     motion = frameDifferenceMagnitude;
   }

   // Same state machine for address/swing detection
   nextState = detectSwing(motion);
   ```

4. **Test robustness:**
   - Does frame diff reduce false negatives?
   - Does it introduce false positives (camera shake, background motion)?

**Effort:** ~1-2 days (native plugin + JS integration)
**Risk:** Low (additive, doesn't break existing logic)
**Reward:** High (immediate improvement to wrist dropout robustness)

---

### Phase 2: Optical Flow for Pattern Verification (Medium Effort, High Value)

**Goal:** Detect characteristic golf swing arc pattern.

1. **Implement sparse Lucas-Kanade optical flow**
   - Native plugin using OpenCV
   - Track feature points in the golfer region
   - Compute flow magnitude and direction

2. **Characterize swing pattern:**
   - Log flow vectors during 50+ swings
   - Identify signature: upward burst (backswing) + downward burst (downswing)
   - Tune thresholds for arc pattern detection

3. **Use as confirmation signal:**
   ```typescript
   // Primary trigger: frame diff or pose velocity spike
   // Confirmation: optical flow shows upward arc pattern
   if (motionSpike && opticalFlowMatchesSwingArc) {
     startRecording();
   }
   ```

**Effort:** ~3-5 days (OpenCV integration + pattern tuning)
**Risk:** Medium (OpenCV dependency, tuning required)
**Reward:** High (reduces false positives from random motion)

---

### Phase 3: Audio Impact Detection (Low Priority, Nice-to-Have)

**Goal:** Auto-trim videos to center on ball impact.

1. **Add audio metering during recording**
   - Use expo-audio or expo-av with metering enabled
   - Poll audio level every 100ms

2. **Detect impact transient:**
   - Look for sudden spike in audio level
   - Mark timestamp of impact

3. **Use for post-processing:**
   - When user saves clip, center video around impact timestamp
   - 2 seconds before impact, 3 seconds after impact

**Effort:** ~1-2 days
**Risk:** Low (additive feature)
**Reward:** Medium (nice UX improvement, not critical)

---

### Phase 4: MHI or Background Subtraction (Research Project)

**Goal:** Explore more advanced motion pattern recognition.

**Only pursue if:**
- Phases 1-2 don't solve robustness issues
- Team has bandwidth for research/training
- Want to build a more sophisticated motion classifier

**MHI Path:**
1. Collect 100+ swing videos + non-swing videos
2. Extract MHI from each video
3. Train simple classifier (k-NN, SVM, or small CNN)
4. Deploy classifier in native plugin

**Background Subtraction Path:**
1. Implement adaptive background model (MOG2)
2. Use foreground blob as ROI for pose detection
3. Track blob centroid motion as fallback signal

**Effort:** ~1-2 weeks per approach
**Risk:** High (requires training data, tuning, validation)
**Reward:** Medium-High (if simpler approaches fail)

---

## Key Takeaways

1. **Frame differencing is the lowest-hanging fruit:** Simple, fast, complements existing pose logic. Prototype this first.

2. **Optical flow is the strongest non-pose approach:** Can detect swing arc pattern without joints. Lucas-Kanade is mobile-friendly.

3. **Audio is valuable for impact detection, not swing start:** Use it for post-processing (auto-trim) rather than real-time triggering.

4. **The "still → burst → still" pattern is universal:** Every approach (frame diff, optical flow, MHI, pose velocity) can detect this temporal signature. The key is choosing the most robust motion signal.

5. **Hybrid approach is best:** Use non-pose methods (frame diff, optical flow) as pre-filters or fallbacks. Use pose for semantic verification when joints are available. Don't rely on pose alone — it's too brittle.

6. **Mobile performance matters:** Lucas-Kanade optical flow and frame differencing are both fast enough for real-time mobile. Dense optical flow and heavy ML models are not.

7. **No single method is perfect:** Golf swing detection is a hard problem. Combining multiple signals (motion magnitude, motion pattern, pose geometry, audio) gives the most robust system.

---

## Sources

### Frame Differencing / Motion Energy
- [Golf Swing Analysis using Computer Vision](https://www.ijraset.com/research-paper/golf-swing-analysis-using-computer-vision)
- [Golf Swing Sequencing Using Computer Vision](https://link.springer.com/chapter/10.1007/978-3-031-04881-4_28)
- [Motion Detection in Videos Using Frame Differencing](https://medium.com/@krrish.kumbhare_84672/motion-detection-in-videos-using-frame-differencing-a4ab5a8663dc)
- [A block-wise frame difference method for real-time video motion detection](https://journals.sagepub.com/doi/full/10.1177/1729881418783633)
- [Frame Differencing Motion Detection Algorithm for Android](https://rosan-international.com/motion_detection_android/)

### Optical Flow
- [Optical-Flow and Human-Segmentation Based Method for Golf Swing Key Event Detection](https://ieeexplore.ieee.org/iel8/10634322/10634595/10634681.pdf)
- [Human motion tracking on broadcast golf swing video using optical flow](https://ieeexplore.ieee.org/iel5/5729855/5735003/05735069.pdf)
- [GolfDB: A Video Database for Golf Swing Sequencing](https://arxiv.org/pdf/1903.06528)
- [OpenCV Optical Flow tutorial](https://docs.opencv.org/3.4/d4/dee/tutorial_optical_flow.html)
- [Optical Flow in OpenCV (C++/Python)](https://learnopencv.com/optical-flow-in-opencv/)
- [Lucas-Kanade vs. Farneback](https://eureka.patsnap.com/article/optical-flow-with-opencv-lucas-kanade-vs-farneback)
- [Creating native frame processors for VisionCamera using OpenCV](https://medium.com/dogtronic/creating-native-frame-processors-for-vision-camera-in-react-native-using-opencv-e6b015005711)
- [RobertYCXu/opticalflow-opencv-android](https://github.com/RobertYCXu/opticalflow-opencv-android)

### Audio Detection
- [Golfshot Auto Shot Tracking](https://golfshot.com/auto-tracking)
- [Shot Tracer](https://www.shottracerapp.com/)
- [Advanced Voice Recognition in React Native](https://medium.com/@detl/advanced-voice-recognition-intelligent-audio-detection-in-react-native-062a4e037e2d)
- [expo-audio documentation](https://docs.expo.dev/versions/latest/sdk/audio/)
- [react-native-voice](https://github.com/react-native-voice/voice)

### Motion History Images (MHI/MEI)
- [The Recognition of Human Movement Using Temporal Templates](https://www.cs.bu.edu/fac/betke/cs591/papers/bobick-davis.pdf)
- [Motion history image: its variants and applications](https://link.springer.com/article/10.1007/s00138-010-0298-4)
- [Real-time Recognition of Activity Using Temporal Templates](https://ieeexplore.ieee.org/document/571995/)
- [Time-weighted MHI for sports activity classification](https://link.springer.com/article/10.1007/s12283-023-00437-1)
- [Multi class activity classification using MHI](https://arxiv.org/html/2410.09902v1)

### Temporal Pattern / Threshold-Based
- [Early Improper Motion Detection in Golf Swings](https://pmc.ncbi.nlm.nih.gov/articles/PMC3715223/)
- [Golf swing motion detection using IMU](https://ieeexplore.ieee.org/document/7521016/)
- [Golf Swing Segmentation from a Single IMU Using Machine Learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC7472298/)
- [Learning golf swing signatures from wrist-worn sensor](https://arxiv.org/html/2506.17505v1)

### Accelerometer/Gyroscope
- [SwingMonitorApp (Apple Watch)](https://github.com/robandrews/SwingMonitorApp)
- [Validation of Accelerometers and Gyroscopes for Golf Analysis](https://link.springer.com/chapter/10.1007/978-0-387-46050-5_28)
- [Golf swing detection using accelerometers - Garmin Forums](https://forums.garmin.com/developer/connect-iq/f/discussion/7639/golf-swing-detection-using-accelerometers---any-suggestions)

### Background Subtraction / Blob Tracking
- [Detecting and Tracking Moving Objects with Background Subtraction](https://medium.com/@siromermer/detecting-and-tracking-moving-objects-with-background-subtractors-using-opencv-f2ff7f94586f)
- [Tracking of Ball and Players in Beach Volleyball Videos](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111730)
- [Object Detection and Tracking in Tennis Video](https://www.researchgate.net/publication/283184656_Object_Detection_and_Tracking_Based_on_Trajectory_in_Broadcast_Tennis_Video)
- [Video Object Extraction for Sports Applications](https://www.ciitresearch.org/dl/index.php/dip/article/view/DIP092013007)

### Mobile Implementation / VisionCamera
- [VisionCamera Frame Processors](https://react-native-vision-camera.com/docs/guides/frame-processors)
- [Creating VisionCamera C++ frame processor using JSI](https://medium.com/@lukasz.kurant/creating-a-high-performance-react-native-vision-camera-c-frame-processor-using-jsi-b00fa8df3221)
- [VisionCamera with OpenCV and YUV420 conversion](https://medium.com/@botelhomarcelo7/visioncamera-with-react-native-frame-processor-plugin-yuv420-conversion-opencv-and-much-more-c0736bfdd154)
- [CompactFlowNet: Efficient Real-time Optical Flow on Mobile](https://arxiv.org/html/2412.13273v1)
- [awesome-mobile-ai: iOS CoreML, Android TFLite](https://github.com/umitkacar/awesome-mobile-ai)
