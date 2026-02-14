"""
Export best.pt to CoreML .mlpackage, then compile to .mlmodelc.

MUST be run on macOS — coremltools requires native macOS libraries.
Requires Python 3.12 (torch has no macOS x86_64 wheels for 3.13+).

Setup:
    python3.12 -m venv /tmp/coreml-export
    /tmp/coreml-export/bin/pip install torch torchvision coremltools ultralytics 'numpy==1.26.4'

Usage:
    /tmp/coreml-export/bin/python export-coreml.py

Or just use yolo directly:
    /tmp/coreml-export/bin/yolo export model=best.pt format=coreml imgsz=320 half
    xcrun coremlcompiler compile best.mlpackage <output-dir>

The iOS native module expects a pre-compiled .mlmodelc directory (NOT .mlpackage).
CocoaPods can bundle .mlmodelc directly, but .mlpackage requires Xcode compilation
which doesn't happen reliably in a pod context.

See docs/architecture/club-model-training.md for full details.
"""

import os
import shutil
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(SCRIPT_DIR, "../../runs/pose/runs/pose/golf-club6/weights")
BEST_PT = os.path.join(WEIGHTS_DIR, "best.pt")
OUTPUT_DIR = os.path.join(
    SCRIPT_DIR,
    "../../modules/vision-camera-club-detection/ios",
)
MLPACKAGE_PATH = os.path.join(OUTPUT_DIR, "golf-club-pose.mlpackage")
MLMODELC_PATH = os.path.join(OUTPUT_DIR, "golf-club-pose.mlmodelc")

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

# Move .mlpackage to the iOS module directory
os.makedirs(OUTPUT_DIR, exist_ok=True)
if os.path.exists(MLPACKAGE_PATH):
    shutil.rmtree(MLPACKAGE_PATH)
shutil.move(export_path, MLPACKAGE_PATH)

# Compile .mlpackage → .mlmodelc (requires Xcode command line tools)
print("Compiling .mlpackage → .mlmodelc...")
if os.path.exists(MLMODELC_PATH):
    shutil.rmtree(MLMODELC_PATH)

result = subprocess.run(
    ["xcrun", "coremlcompiler", "compile", MLPACKAGE_PATH, OUTPUT_DIR],
    capture_output=True,
    text=True,
)
if result.returncode != 0:
    print(f"Error compiling CoreML model: {result.stderr}")
    print("You can compile manually: xcrun coremlcompiler compile golf-club-pose.mlpackage <output-dir>")
    sys.exit(1)

# Clean up .mlpackage — only .mlmodelc is needed for the iOS build
shutil.rmtree(MLPACKAGE_PATH)

size_bytes = sum(
    os.path.getsize(os.path.join(dp, f))
    for dp, dn, filenames in os.walk(MLMODELC_PATH)
    for f in filenames
)
print(f"Compiled CoreML model saved to {MLMODELC_PATH} ({size_bytes / 1024 / 1024:.1f} MB)")
print("(.mlpackage removed — only .mlmodelc is needed for iOS builds)")
