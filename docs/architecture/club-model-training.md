# Golf Club Pose Model — Training & Export Guide

How we trained the YOLOv8-nano-pose model for golf club keypoint detection, and how to retrain if needed.

## Overview

- **Model**: YOLOv8n-pose (3M params, 8.3 GFLOPs)
- **Task**: Detect golf club + 3 keypoints (grip, shaft midpoint, clubhead)
- **Input**: 320×320 RGB image
- **Output**: `(1, 14, 2100)` — 2100 candidate detections, each with 4 bbox + 1 confidence + 9 keypoint values (3 keypoints × [x, y, conf])
- **Final metrics**: Pose mAP50 = 0.995, Pose mAP50-95 = 0.994
- **Model size**: ~6MB per format (CoreML, TFLite, ONNX)

## Dataset

**Source**: Roboflow Universe — "Golf Club Pose" dataset
**License**: CC BY 4.0
**Size**: 639 images (480 train / 96 val / 63 test)

### Keypoint definitions

| Index | Name | Description |
|-------|------|-------------|
| 0 | Grip | Where hands hold the club |
| 1 | Shaft midpoint | Middle of the shaft |
| 2 | Clubhead | Bottom / hitting surface |

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
  device=cpu
```

**Key settings**:
- `imgsz=320`: Club is a large object in frame; 320px sufficient, 2-3x faster than 640
- `patience=30`: Early stopping if no improvement for 30 epochs
- `model=yolov8n-pose.pt`: Transfer learning from COCO pose pretrained weights
- `device=cpu`: See GPU notes above

### Expected training behavior

- **Epochs 1-10**: Rapid improvement, Pose mAP50 reaches ~0.94
- **Epochs 10-50**: Steady improvement to ~0.98
- **Epochs 50-200**: Diminishing returns, eventually saturates at ~0.994
- Early stopping didn't trigger in our run — the model kept finding tiny improvements through all 200 epochs

### Output

```
runs/pose/runs/pose/golf-club/
├── weights/
│   ├── best.pt       # Best checkpoint (use this)
│   └── last.pt       # Final epoch checkpoint
├── results.csv       # Per-epoch metrics
├── results.png       # Training curves
├── confusion_matrix.png
└── train_batch*.jpg  # Training sample visualizations
```

## Export

The model needs to be exported to platform-specific formats:
- **iOS**: CoreML `.mlpackage` (FP16)
- **Android**: TFLite `.tflite` (FP16)

### TFLite export (works on Linux)

Direct `yolo export format=tflite` requires TensorFlow, which may not have wheels for your Python version. Use the ONNX → TFLite route instead:

```bash
# 1. Export to ONNX (works everywhere)
yolo export model=best.pt format=onnx imgsz=320 half

# 2. Convert ONNX to TFLite via onnx2tf (needs Python 3.12 venv if on 3.14)
pip install onnx2tf
onnx2tf -i best.onnx -o tflite_output
# Use: tflite_output/best_float16.tflite
```

`onnx2tf` produces multiple variants. **Use `best_float16.tflite`** — do NOT use INT8 quantized variants, they break keypoint coordinates ([ultralytics#5889](https://github.com/ultralytics/ultralytics/issues/5889)).

### CoreML export (requires macOS)

CoreML export uses native macOS libraries (`libcoremlpython`, `libmilstoragepython`) that don't exist on Linux. Two options:

#### Option A: yolo export on Mac (recommended)

```bash
# On a Mac with Python 3.12 (torch has no macOS x86_64 wheels for 3.13+)
python3.12 -m venv /tmp/coreml-export
/tmp/coreml-export/bin/pip install torch torchvision coremltools ultralytics 'numpy==1.26.4'

# Copy best.pt to the Mac, then:
yolo export model=best.pt format=coreml imgsz=320 half
```

**numpy version gotcha**: torch 2.2.2 (last x86_64 macOS version) needs numpy <2. Pin to `numpy==1.26.4`.

#### Option B: SSH to Mac (how we did it)

We used the build Mac available via `ssh mac` — same machine used for `scripts/local-build.sh`:

```bash
# Copy model to Mac
scp best.pt mac:~/dev/swing-app/runs/pose/runs/pose/golf-club/weights/

# Create venv and install deps on Mac
ssh mac "python3.12 -m venv /tmp/coreml-export"
ssh mac "/tmp/coreml-export/bin/pip install torch torchvision coremltools ultralytics 'numpy==1.26.4'"

# Run export
ssh mac "cd ~/dev/swing-app && /tmp/coreml-export/bin/yolo export model=runs/pose/runs/pose/golf-club/weights/best.pt format=coreml imgsz=320 half"

# Pull result back
scp -r mac:~/dev/swing-app/runs/pose/runs/pose/golf-club/weights/best.mlpackage ./golf-club-pose.mlpackage
```

### Where models go

```
modules/vision-camera-club-detection/
├── ios/
│   └── golf-club-pose.mlpackage/        ← CoreML model
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
3. Train: `yolo pose train model=yolov8n-pose.pt data=data.yaml epochs=200 imgsz=320 batch=16 patience=30 device=cpu`
4. Export ONNX: `yolo export model=best.pt format=onnx imgsz=320 half`
5. Convert ONNX → TFLite: `onnx2tf -i best.onnx -o tflite_output` (use `best_float16.tflite`)
6. Export CoreML on Mac: `yolo export model=best.pt format=coreml imgsz=320 half`
7. Copy models to native module directories
8. Verify output shapes match `(1, 14, 2100)` or `(1, 14, N)` for different `imgsz`
9. Dev build and test on device

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
| TensorFlow has no Python 3.14 wheels | Use Python 3.12 venv or onnx2tf route |
| `polars` module missing during training save | `pip install polars` |
| `data.yaml` path must be absolute with `yolo` CLI | Always use full path |
