"""
Convert best.onnx to CoreML .mlpackage format.

MUST be run on macOS — coremltools requires native macOS libraries.

Usage:
    pip install coremltools onnx
    python export-coreml.py
"""

import os
import sys

try:
    import coremltools as ct
except ImportError:
    print("Error: coremltools not installed. Run: pip install coremltools onnx")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(SCRIPT_DIR, "../../runs/pose/runs/pose/golf-club/weights")
ONNX_PATH = os.path.join(WEIGHTS_DIR, "best.onnx")
OUTPUT_PATH = os.path.join(
    SCRIPT_DIR,
    "../../modules/vision-camera-club-detection/ios/golf-club-pose.mlpackage",
)

if not os.path.exists(ONNX_PATH):
    print(f"Error: ONNX model not found at {ONNX_PATH}")
    sys.exit(1)

print(f"Converting {ONNX_PATH} to CoreML...")

model = ct.converters.convert(
    ONNX_PATH,
    source="pytorch",
    convert_to="mlprogram",
    minimum_deployment_target=ct.target.iOS15,
    compute_precision=ct.precision.FLOAT16,
)

model.save(OUTPUT_PATH)
print(f"CoreML model saved to {OUTPUT_PATH}")
print(f"Size: {os.path.getsize(OUTPUT_PATH) / 1024 / 1024:.1f} MB")
