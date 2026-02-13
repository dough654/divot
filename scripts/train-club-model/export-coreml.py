"""
Export best.pt to CoreML .mlpackage format.

MUST be run on macOS — coremltools requires native macOS libraries.
Requires Python 3.12 (torch has no macOS x86_64 wheels for 3.13+).

Setup:
    python3.12 -m venv /tmp/coreml-export
    /tmp/coreml-export/bin/pip install torch torchvision coremltools ultralytics 'numpy==1.26.4'

Usage:
    /tmp/coreml-export/bin/python export-coreml.py

Or just use yolo directly:
    /tmp/coreml-export/bin/yolo export model=best.pt format=coreml imgsz=320 half

See docs/architecture/club-model-training.md for full details.
"""

import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(SCRIPT_DIR, "../../runs/pose/runs/pose/golf-club/weights")
BEST_PT = os.path.join(WEIGHTS_DIR, "best.pt")
OUTPUT_DIR = os.path.join(
    SCRIPT_DIR,
    "../../modules/vision-camera-club-detection/ios",
)
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "golf-club-pose.mlpackage")

if not os.path.exists(BEST_PT):
    print(f"Error: Trained model not found at {BEST_PT}")
    print("Train the model first: python train.py train")
    sys.exit(1)

try:
    from ultralytics import YOLO
except ImportError:
    print("Error: ultralytics not installed.")
    print("Run: pip install torch torchvision coremltools ultralytics 'numpy==1.26.4'")
    sys.exit(1)

print(f"Loading {BEST_PT}...")
model = YOLO(BEST_PT)

print("Exporting to CoreML FP16...")
export_path = model.export(format="coreml", imgsz=320, half=True)

# Move to the iOS module directory
os.makedirs(OUTPUT_DIR, exist_ok=True)
if os.path.exists(OUTPUT_PATH):
    import shutil
    shutil.rmtree(OUTPUT_PATH)

import shutil
shutil.move(export_path, OUTPUT_PATH)

size_bytes = sum(
    os.path.getsize(os.path.join(dp, f))
    for dp, dn, filenames in os.walk(OUTPUT_PATH)
    for f in filenames
)
print(f"CoreML model saved to {OUTPUT_PATH} ({size_bytes / 1024 / 1024:.1f} MB)")
