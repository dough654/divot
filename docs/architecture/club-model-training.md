# Golf Club Pose Model — Training & Export Guide

How we trained the YOLOv8-nano-pose model for golf club keypoint detection, and how to retrain if needed.

## Overview

- **Model**: YOLOv8n-pose (3M params, 8.3 GFLOPs)
- **Task**: Detect golf club + 3 keypoints (grip, shaft midpoint, clubhead)
- **Input**: 320×320 RGB image
- **Output**: `(1, 14, 2100)` — 2100 candidate detections, each with 4 bbox + 1 confidence + 9 keypoint values (3 keypoints × [x, y, conf])
- **Final metrics**: Pose mAP50 = 0.995, Pose mAP50-95 = 0.994 (golf-club6 run)
- **Model size**: ~6MB per format (CoreML, TFLite, ONNX)
- **Current run**: `golf-club6` — retrained with `translate=0.5` to fix center bias from earlier runs

## Dataset

**Source**: Roboflow Universe — "Golf Club Pose" dataset
**License**: CC BY 4.0
**Size**: 639 images (480 train / 96 val / 63 test)

### Keypoint definitions

| Index | Name | Description |
|-------|------|-------------|
| 0 | Clubhead | Bottom / hitting surface |
| 1 | Shaft midpoint | Middle of the shaft |
| 2 | Grip | Where hands hold the club |

> **Note**: The keypoint order was confirmed via on-device testing. The Roboflow
> dataset labels index 0 as the clubhead (bottom of club) and index 2 as the grip
> (top, near hands). The JS hook swaps these to semantic field names.

### Label format (YOLO pose)

Each `.txt` label file has one line per object:
```
class cx cy w h kp0_x kp0_y kp0_v kp1_x kp1_y kp1_v kp2_x kp2_y kp2_v
```

14 values total. Coordinates normalized 0-1. Visibility: 0=not labeled, 1=labeled but occluded, 2=labeled and visible.

### data.yaml

```yaml
path: /absolute/path/to/datasets/golf_club_pose
train: train/images
val: valid/images
test: test/images

names:
  0: club

kpt_shape: [3, 3]
flip_idx: [0, 1, 2]
```

**Important**: `kpt_shape` is `[3, 3]` (3 keypoints, 3 values each), NOT `[2, 3]`.

### Dataset composition

Almost entirely **down-the-line (DTL)** views. Only one sequence is face-on (`Wedge-FaceOn-SloMo`). The model works well for DTL but will need additional face-on training data when that camera angle is supported.

### Downloading the dataset

```python
from roboflow import Roboflow

rf = Roboflow(api_key="YOUR_API_KEY")
project = rf.workspace("golf-zsfiv").project("golf-club-pose")
dataset = project.version(1).download("yolov8-pose", location="datasets/golf_club_pose")
```

Get an API key at https://app.roboflow.com/settings/api (publishable key is fine for downloads).

## Training

### Environment setup

```bash
cd scripts/train-club-model
python3 -m venv .venv
source .venv/bin/activate
pip install ultralytics roboflow
```

#### GPU notes

- **NVIDIA GPU**: Works out of the box with `device=0`
- **AMD GPU (ROCm)**: Install `python-pytorch-rocm` system package, create venv with `--system-site-packages`, install ultralytics with `--no-deps`. Set `HSA_OVERRIDE_GFX_VERSION=10.3.0` for gfx1031 GPUs. **However**, torchvision NMS doesn't work on ROCm — training with `device=0` will fail at validation. Use `device=cpu` instead.
- **CPU**: Works fine. ~2.2 it/s, full 200 epochs in ~48 minutes on a Ryzen 9 3900X.
- **Apple Silicon**: Should work with `device=mps`

#### Critical: torchvision NMS on ROCm

Even with ROCm-enabled PyTorch, the `torchvision::nms` CUDA kernel is not available because the system `python-torchvision` package is CPU-only. Installing `python-torchvision-cuda` would **replace** `python-pytorch-rocm` with the NVIDIA-only `python-pytorch-cuda`. **Do not do this.** Just use `device=cpu`.

### Running training

```bash
source .venv/bin/activate

yolo pose train \
  model=yolov8n-pose.pt \
  data=/absolute/path/to/datasets/golf_club_pose/data.yaml \
  epochs=200 \
  imgsz=320 \
  batch=16 \
  project=runs/pose \
  name=golf-club \
  patience=30 \
  translate=0.5 \
  device=cpu
```

**Key settings**:
- `imgsz=320`: Club is a large object in frame; 320px sufficient, 2-3x faster than 640
- `patience=30`: Early stopping if no improvement for 30 epochs
- `model=yolov8n-pose.pt`: Transfer learning from COCO pose pretrained weights
- `translate=0.5`: Random translation augmentation — **critical** to prevent center bias. Without this, the model only detects clubs near the center of frame. Default is 0.1 which is too low for our use case.
- `device=cpu`: See GPU notes above

### Expected training behavior

- **Epochs 1-10**: Rapid improvement, Pose mAP50 reaches ~0.94
- **Epochs 10-50**: Steady improvement to ~0.98
- **Epochs 50-200**: Diminishing returns, eventually saturates at ~0.994
- Early stopping didn't trigger in our run — the model kept finding tiny improvements through all 200 epochs

### Output

```
runs/pose/runs/pose/golf-club6/
├── weights/
│   ├── best.pt       # Best checkpoint (use this)
│   └── last.pt       # Final epoch checkpoint
├── results.csv       # Per-epoch metrics
├── results.png       # Training curves
├── confusion_matrix.png
└── train_batch*.jpg  # Training sample visualizations
```

The run name increments (`golf-club`, `golf-club2`, ... `golf-club6`). Always use the latest run's `best.pt`.

## Export

The model needs to be exported to platform-specific formats:
- **iOS**: CoreML `.mlpackage` → `.mlmodelc` (FP16)
- **Android**: TFLite `.tflite` (FP16)

Both exports require macOS with Python 3.12. TFLite export technically works on Linux but the dependency chain (TensorFlow, onnx2tf) has no Python 3.13+ wheels. Just do both on the Mac.

### Mac venv setup (one-time, both formats)

The dependency chain is fragile. This exact sequence is tested and works:

```bash
# On Mac (ssh mac), Python 3.12 via Homebrew
python3.12 -m venv /tmp/coreml-export
/tmp/coreml-export/bin/pip install \
  'ultralytics==8.4.14' \
  'numpy==1.26.4' \
  'onnx<1.20' \
  'ml_dtypes>=0.5.0' \
  torch torchvision coremltools \
  onnx onnxslim onnxruntime \
  tf_keras tensorflow

# onnx2tf must be installed separately with --no-deps to avoid pulling in
# onnxsim (won't compile on macOS) and ai-edge-litert (no macOS wheels)
/tmp/coreml-export/bin/pip install --no-deps 'onnx2tf==1.25.9' sng4onnx

# onnx_graphsurgeon from NVIDIA index (transitive dep of onnx2tf)
/tmp/coreml-export/bin/pip install onnx_graphsurgeon \
  --extra-index-url https://pypi.ngc.nvidia.com
```

**Why these exact versions?**

| Pin | Reason |
|-----|--------|
| `ultralytics==8.4.14` | Newer versions rename `YOLO` to `YOLOE`, breaking imports. `tf_keras` can pull in a newer ultralytics as a transitive dep. |
| `numpy==1.26.4` | torch 2.2.2 (last x86_64 macOS) needs numpy <2 |
| `onnx<1.20` | onnx 1.20 requires `ml_dtypes.float4_e2m1fn` which doesn't exist yet |
| `ml_dtypes>=0.5.0` | Needed by onnx/onnxruntime but older versions conflict |
| `onnx2tf==1.25.9` | Newer versions require `ai-edge-litert` which has no macOS wheels |
| `--no-deps` on onnx2tf | Avoids `onnxsim` (C++ build fails on macOS) |

### CoreML export (iOS)

CoreML export uses native macOS libraries (`libcoremlpython`, `libmilstoragepython`) that don't exist on Linux.

```bash
# Copy weights to Mac
WEIGHTS=runs/pose/runs/pose/golf-club6/weights/best.pt
scp $WEIGHTS mac:~/best.pt

# Export on Mac
ssh mac "/tmp/coreml-export/bin/yolo export model=~/best.pt format=coreml imgsz=320 half"

# Compile .mlpackage → .mlmodelc (REQUIRED for CocoaPods bundling)
ssh mac "xcrun coremlcompiler compile ~/best.mlpackage ~/coreml-out/"

# Pull compiled model back
scp -r mac:~/coreml-out/golf-club-poseModel.mlmodelc \
  modules/vision-camera-club-detection/ios/golf-club-pose.mlmodelc
```

**Why .mlmodelc?** CocoaPods bundles `.mlmodelc` directories directly as resources. `.mlpackage` files require Xcode compilation at build time, which doesn't happen reliably for pod resources. Always pre-compile with `xcrun coremlcompiler compile`.

> **Note**: The compiled directory name may vary (e.g. `golf-club-poseModel.mlmodelc` vs `bestModel.mlmodelc`) depending on the input filename. Check the output of `xcrun coremlcompiler compile` to see what it actually produced.

### TFLite export (Android)

Uses the ONNX → SavedModel → TFLite FP16 pipeline:

```bash
# Export ONNX on Mac (or Linux — ONNX export works everywhere)
ssh mac "/tmp/coreml-export/bin/yolo export model=~/best.pt format=onnx imgsz=320 half"

# Convert ONNX → TFLite via onnx2tf
# This step takes 5-10 minutes — use nohup if running over SSH to avoid timeout
ssh mac "cd ~ && nohup /tmp/coreml-export/bin/onnx2tf -i best.onnx -o tflite_output > onnx2tf.log 2>&1 &"

# Poll for completion
ssh mac "ps aux | grep onnx2tf"   # wait until gone
ssh mac "tail -5 ~/onnx2tf.log"   # check result

# Pull the FP16 model back
scp mac:~/tflite_output/best_float16.tflite \
  modules/vision-camera-club-detection/android/src/main/assets/golf-club-pose.tflite
```

`onnx2tf` produces multiple variants. **Use `best_float16.tflite`** — do NOT use INT8 quantized variants, they break keypoint coordinates ([ultralytics#5889](https://github.com/ultralytics/ultralytics/issues/5889)).

### SSH timeout note

The TFLite conversion (onnx2tf) can take 5-10 minutes. SSH connections may timeout during this period, killing the process. Always use `nohup ... &` for long-running exports and poll with `ps` / `tail` instead of waiting interactively.

### Where models go

```
modules/vision-camera-club-detection/
├── ios/
│   └── golf-club-pose.mlmodelc/         ← Pre-compiled CoreML model
└── android/
    └── src/main/assets/
        └── golf-club-pose.tflite        ← TFLite model
```

### Verifying output shapes

Both models should have:
- **Input**: `(1, 3, 320, 320)` BCHW for CoreML, `(1, 320, 320, 3)` NHWC for TFLite
- **Output**: `(1, 14, 2100)` — 14 = 4 (bbox) + 1 (class conf) + 9 (3 keypoints × 3)

Verify TFLite:
```python
import tensorflow as tf
interp = tf.lite.Interpreter(model_path="golf-club-pose.tflite")
interp.allocate_tensors()
print(interp.get_input_details()[0]['shape'])   # [1, 320, 320, 3]
print(interp.get_output_details()[0]['shape'])   # [1, 14, 2100]
```

## Native Post-Processing

NMS is **not baked into** CoreML or TFLite pose model exports. The native code handles:

1. Transpose output `(1, 14, N)` → `(N, 14)`
2. Filter by confidence threshold (0.25)
3. Greedy NMS with IoU threshold (0.45) — trivial for 1-object detection
4. Extract 3 keypoints from top detection
5. Store as 9-element array: `[grip_x, grip_y, grip_conf, shaftMid_x, shaftMid_y, shaftMid_conf, head_x, head_y, head_conf]`

See:
- iOS: `modules/vision-camera-club-detection/ios/CoreMLClubDetector.swift`
- Android: `modules/vision-camera-club-detection/android/.../TFLiteClubDetector.kt`

## Retraining Checklist

1. Download or augment dataset (Roboflow)
2. Verify `data.yaml` has correct paths and `kpt_shape: [3, 3]`
3. Train: `yolo pose train model=yolov8n-pose.pt data=data.yaml epochs=200 imgsz=320 batch=16 patience=30 translate=0.5 device=cpu`
4. Set up Mac venv if needed (see "Mac venv setup" above)
5. `scp` the `best.pt` to Mac
6. CoreML: `yolo export format=coreml imgsz=320 half` → `xcrun coremlcompiler compile` → `scp` `.mlmodelc` back
7. TFLite: `yolo export format=onnx imgsz=320 half` → `nohup onnx2tf -i best.onnx -o tflite_output &` → `scp` `best_float16.tflite` back
8. Copy models to native module directories (`.mlmodelc` for iOS, `.tflite` for Android)
9. Verify output shapes match `(1, 14, 2100)` or `(1, 14, N)` for different `imgsz`
10. Dev build and test on device

## Known Issues & Gotchas

| Issue | Fix |
|-------|-----|
| `torchvision::nms` NotImplementedError on ROCm | Use `device=cpu` |
| `python-torchvision-cuda` conflicts with `python-pytorch-rocm` | Don't install it. Use CPU. |
| TFLite INT8 quantization breaks keypoint coords | Use FP16 only |
| CoreML export fails on Linux ("BlobWriter not loaded") | Must export on macOS |
| `coremltools` can't detect ONNX source without torch | Install torch in same venv, or use `yolo export` |
| numpy 2.x incompatible with torch 2.2.x | Pin `numpy==1.26.4` |
| PyTorch has no macOS x86_64 wheels for Python 3.13+ | Use Python 3.12 venv on Mac |
| TensorFlow has no Python 3.14 wheels | Use Python 3.12 venv on Mac |
| `polars` module missing during training save | `pip install polars` |
| `data.yaml` path must be absolute with `yolo` CLI | Always use full path |
| `.mlpackage` not found by CocoaPods at runtime | Pre-compile to `.mlmodelc` with `xcrun coremlcompiler compile` |
| `Bundle.main` doesn't find pod resources | Use `Bundle(for: YourClass.self)` with fallback to `Bundle.main` |
| `onnxsim` won't compile on macOS | Install `onnx2tf` with `--no-deps` to skip it |
| `ai-edge-litert` has no macOS wheels | Pin `onnx2tf==1.25.9` which uses older TF Lite converter |
| `onnx>=1.20` requires `ml_dtypes.float4_e2m1fn` | Pin `onnx<1.20` |
| `tf_keras` pulls in newer ultralytics (breaks `YOLO` import) | Pin `ultralytics==8.4.14` |
| SSH timeout kills long-running exports | Use `nohup ... &` and poll with `ps`/`tail` |
| Model detects clubs only near center of frame | Train with `translate=0.5` (default 0.1 is too low) |
| `eas build --local` reuses stale native code | Delete `ios/` directory on Mac before rebuilding |
