# Pose Model Research & Setup Check Feasibility

Research into golf-specific pose models, current model limitations, and whether we can build features like address setup checks on the existing architecture.

## Current Architecture Limitations

### What We're Using

- **iOS**: Apple Vision `VNDetectHumanBodyPoseRequest` (~5ms, Neural Engine)
- **Android**: ML Kit Pose Detection in STREAM_MODE (NNAPI)
- **Output**: 14-joint `PoseFrame` normalized to 0–1 coordinates with per-joint confidence

### Observed Problems (Real Device Testing, Feb 2025)

1. **Confidence bouncing**: Wrist confidence oscillates 0.0→0.6→0.0 frame-to-frame even when standing still. At 0.0 confidence, positions are garbage (wrist distance jumps to 0.65+ when they should be ~0.05).

2. **Lower body dropout**: **Knees and ankles are the most frequently lost joints**, even standing still at address with full body clearly in frame. Likely causes:
   - Side-view (down-the-line) poses put one leg behind the other, causing partial occlusion
   - Apple Vision's model may be weaker on lower body joints generally, or undertrained on side-view standing poses
   - Clothing contrast against background (dark pants on grass, etc.)
   - NOT a framing issue — confirmed full body was visible in testing

3. **Hip Y instability**: Hip vertical position oscillates wildly (0.02→0.45 normalized) frame-to-frame, making hip-relative checks unreliable. We removed the hip check from address detection entirely.

4. **Minimum visible joints**: Even with stillness threshold set to 2 joints minimum, some frames have fewer than 2 joints above 0.1 confidence.

### Mitigations Implemented

- EMA smoothing (`smoothPoseFrame`) applied before address detection — carries forward last-known-good positions when confidence drops to garbage, blends positions when confidence is usable
- Skeleton overlay smoothing (separate `smoothPoseData`) for rendering with joint persistence up to 5 frames
- Generous miss tolerance in the address state machine (4 misses during confirmation, 12 exit polls)

### Implications for Setup Check Feature

The knee/ankle dropout is the biggest concern. A setup check needs reliable:
- **Knee bend angle** (hip → knee → ankle) — requires both knee AND ankle
- **Spine tilt** (shoulder midpoint → hip midpoint) — hips are noisy but usually present
- **Shoulder over toes** (shoulder X vs ankle X) — requires ankle

If knees and ankles are the weakest joints, the two most important setup metrics are built on unreliable data. Smoothing helps with intermittent dropout but can't help if the model consistently fails to detect lower body in a given camera placement.

## Golf-Specific Open Source Models

### GolfPose (ICPR 2024) — Most Relevant

- **Repo**: [github.com/MingHanLee/GolfPose](https://github.com/MingHanLee/GolfPose)
- **Paper**: [From Regular Posture to Golf Swing Posture](https://link.springer.com/chapter/10.1007/978-3-031-78305-0_25)
- **What**: Fine-tunes HRNet-w48, ViTPose-Huge, and DEKR on golf-specific data. Also does 3D lifting via MixSTE.
- **Keypoints**: 17 COCO body + 5 golf club = 22 total
- **Accuracy**: 2D AP 0.857–0.942 (vs off-the-shelf baseline). 3D MPJPE drops from 109.4mm to 30.7mm.
- **Key finding**: Off-the-shelf pose models perform badly on golf swings. Fine-tuning on even a modest golf dataset improves accuracy ~3x.
- **Pretrained weights**: Available via GoFile links in repo
- **Mobile-ready**: No — ViTPose-Huge and HRNet-w48 are too large. But the fine-tuning approach could be applied to lighter backbones (RTMPose-s, ViTPose-S, MoveNet).
- **Dataset**: ~13,782 annotated golf images. Contact `mhlee.cs09@nycu.edu.tw` for access.

### GolfPoseNet (IEEE 2025)

- **Paper**: [Golf-Specific 3D Human Pose Estimation Network](https://ieeexplore.ieee.org/document/10879645/)
- **What**: HRNet for 2D + transformer-based 3D lifting. Multi-view training without 3D annotations.
- **Availability**: Paper only, no public code.

### GolfMate (Applied Sciences 2023)

- **Paper**: [Enhanced Golf Swing Analysis Tool](https://www.mdpi.com/2076-3417/13/20/11227)
- **What**: Pose refinement + swing embedding → explainable feature vector + comparison with pro swings.
- **Relevant**: Compares joint angles against professional references and generates corrective text/video feedback.
- **Availability**: Paper only.

## Golf Datasets for Fine-Tuning

### CaddieSet (CVPR 2025 Workshop) — Best for Setup Check

- **Repo**: [github.com/damilab/CaddieSet](https://github.com/damilab/CaddieSet)
- **Paper**: [CVPR2025W](https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/papers/Jung_CaddieSet_A_Golf_Swing_Dataset_with_Human_Joint_Features_and_CVPRW_2025_paper.pdf)
- **Contents**: 1,757 shots from 8 golfers (924 face-on, 833 down-the-line)
- **Features**: 17 joint coordinates + **22 biomechanical features** including:
  - Spine angle and tilt
  - Limb angles (knee bend, hip bend, elbow angle)
  - Hip rotation and weight shift
  - Stance ratio and upper-body tilt
- **Also includes**: Ball flight data (direction angle, spin axis, ball speed, carry distance)
- **Why it matters**: The 22 biomechanical features are exactly the "setup check" angles we'd want to measure. This dataset defines what "good" ranges look like for each metric.

### GolfDB (CVPR 2019 Workshop)

- **Repo**: [github.com/wmcnally/golfdb](https://github.com/wmcnally/golfdb)
- **Contents**: 1,400 swing videos, 390k+ frames, 8 swing event labels
- **Note**: Event/phase labels only — no pose keypoint annotations. Useful for swing phase detection (SwingNet), not for pose fine-tuning.

### GolfPose GolfSwing Dataset

- **Source**: Contact GolfPose authors for access
- **Contents**: ~13,782 images with COCO-format keypoint annotations + numpy 2D/3D ground truth
- **Best for**: Fine-tuning pose estimation models specifically for golf

### Others

- **Kaggle Golf-Pose**: [kaggle.com/datasets/rakshitgirish/golf-pose](https://www.kaggle.com/datasets/rakshitgirish/golf-pose) — limited info
- **Roboflow Golf Swing datasets**: Object detection (bounding box) only, not keypoint annotations

## Commercial Apps as Feature Reference

These apps prove the setup check concept works in consumer products:

| App | Key Feature | Approach |
|-----|------------|----------|
| **Onform** | 3D model from single video, published model card | Fully on-device, validated against GEARS/OptiTrack |
| **Sportsbox AI** | Kinematic AI, 3D from single 2D video | Measures chest turn, pelvis sway, hip sway |
| **DeepSwing** | Phase segmentation + angle comparison | Club-specific ideal ranges, 3D ghost overlay |
| **GolfFix AI** | 45+ swing issue detection, posture drills | Closest to a "setup check" feature |
| **XView AI** | 240fps tracking, body + shaft + club head | Live real-time skeletal overlays, fully on-device |

## Feasibility Assessment

### Setup Check at Address — Likely Feasible

Address position is the **least occluded** golf pose — the golfer is standing relatively upright with arms extended. This is close to the standing poses these models handle best. Key considerations:

- **Upper body metrics** (spine tilt, shoulder position): Probably accurate enough with current models + smoothing. Shoulders and hips are usually detected.
- **Lower body metrics** (knee bend, weight distribution): This is the weak point. If knees/ankles keep dropping, we'd need either:
  - Better camera placement guidance (ensure full body is in frame, good lighting on legs)
  - EMA smoothing tuned to persist lower body joints longer
  - A fine-tuned model that prioritizes full-body detection in golf poses

### Mid-Swing Analysis — Probably Needs a Better Model

Self-occlusion during backswing/downswing destroys accuracy for all general-purpose models. The GolfPose paper quantifies this — 3x improvement from golf-specific fine-tuning. For features like swing plane, kinematic sequence, or impact analysis, we'd likely need to go beyond the platform models.

## Recommended Path Forward

### Short Term: Maximize Current Models

1. Test the EMA-smoothed address detection — if it reliably enters and holds address, the same smoothed keypoints can compute setup angles.
2. Add camera placement guidance ("position phone so full body is visible") to improve lower body detection.
3. Implement a prototype setup check using smoothed keypoints + CaddieSet's biomechanical feature definitions as reference ranges.
4. If lower body is still too unreliable, focus setup check on upper body metrics only (spine tilt, shoulder position, head position).

### Medium Term: Fine-Tune a Lighter Model

If current models aren't accurate enough, the most promising path is:

1. **Base model**: RTMPose-s or ViTPose-S (both available in ONNX)
2. **Training data**: GolfPose dataset (~13,782 images) + CaddieSet annotations
3. **Target**: Deploy via CoreML (iOS) and TFLite (Android) using the existing frame processor plugin architecture
4. **Expected improvement**: ~3x based on GolfPose paper results, with better lower body joint detection in golf-specific poses

This is a meaningful project (dataset acquisition, training infrastructure, model export, native integration) but uses proven techniques and existing open-source tools.

### Long Term: Full Swing Analysis Pipeline

Combine fine-tuned pose model + SwingNet phase detection + club tracking (from `on-device-ml-analysis.md` plan) for comprehensive post-swing analysis.

## References

- [GolfPose (ICPR 2024)](https://link.springer.com/chapter/10.1007/978-3-031-78305-0_25) — [GitHub](https://github.com/MingHanLee/GolfPose)
- [GolfPoseNet (IEEE 2025)](https://ieeexplore.ieee.org/document/10879645/)
- [GolfMate (Applied Sciences 2023)](https://www.mdpi.com/2076-3417/13/20/11227)
- [CaddieSet (CVPR 2025)](https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/papers/Jung_CaddieSet_A_Golf_Swing_Dataset_with_Human_Joint_Features_and_CVPRW_2025_paper.pdf) — [GitHub](https://github.com/damilab/CaddieSet)
- [GolfDB / SwingNet (CVPR 2019)](https://openaccess.thecvf.com/content_CVPRW_2019/papers/CVSports/McNally_GolfDB_A_Video_Database_for_Golf_Swing_Sequencing_CVPRW_2019_paper.pdf) — [GitHub](https://github.com/wmcnally/golfdb)
- [MIT Thesis: Biomechanical Golf Swing via MeTRAbs (2025)](https://dspace.mit.edu/handle/1721.1/162530)
- [RTMPose / rtmlib](https://github.com/Tau-J/rtmlib)
- [Onform 3D Model Card](https://onform.com/wp-content/uploads/2025/10/Onform-3D-Golf-Swing-Pose-Estimation-Model_Sept-30-2025-v2.pdf)
- [DHU-Golf (IEEE 2022)](https://ieeexplore.ieee.org/document/9897609/) — [GitHub](https://github.com/DHU-Golf/detect)
