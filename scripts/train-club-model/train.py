#!/usr/bin/env python3
"""
Golf Club Keypoint Detection — YOLOv8-nano-pose Training Script

Trains a YOLOv8-nano-pose model to detect 3 keypoints on a golf club:
  - Keypoint 0: Grip (where hands hold the club)
  - Keypoint 1: Shaft midpoint (middle of the shaft)
  - Keypoint 2: Club head (bottom / hitting surface)

See docs/architecture/club-model-training.md for the full training guide
including environment setup, export gotchas, and troubleshooting.

Usage:
  1. Install dependencies:
       pip install ultralytics roboflow

  2. Download dataset:
       python train.py download

  3. Train:
       python train.py train

  4. Export for mobile:
       python train.py export

Output:
  - runs/pose/golf-club/weights/best.pt  (trained model)
  - golf-club-pose.mlpackage              (iOS CoreML — must export on macOS)
  - golf-club-pose.tflite                 (Android TFLite)
"""

import sys
from pathlib import Path

# Training configuration
TRAIN_CONFIG = {
    "model": "yolov8n-pose.pt",   # Transfer learn from COCO pose pretrained
    "data": "data.yaml",          # Dataset config (create after downloading)
    "epochs": 200,
    "imgsz": 320,                 # Club is large in frame; 320px is sufficient
    "batch": 16,
    "project": "runs/pose",
    "name": "golf-club",
    "patience": 30,               # Early stopping patience
    "translate": 0.5,             # Aggressive translation augmentation (±50%)
    "device": "cpu",              # ROCm NMS is broken; CPU is ~48min for 200 epochs
    "save": True,
    "plots": True,
}

# Export configuration
EXPORT_IMGSZ = 320
BEST_WEIGHTS = Path("runs/pose/golf-club/weights/best.pt")


def download_dataset():
    """
    Downloads golf club keypoint datasets from Roboflow.

    You'll need a Roboflow API key. Set it as an environment variable:
      export ROBOFLOW_API_KEY="your_key_here"

    Downloads to: datasets/golf_club_pose/

    The dataset includes data.yaml with kpt_shape: [3, 3] (3 keypoints, 3 dims).
    Train command needs the ABSOLUTE path to this data.yaml.
    """
    try:
        from roboflow import Roboflow
        import os

        api_key = os.environ.get("ROBOFLOW_API_KEY")
        if not api_key:
            print("Error: Set ROBOFLOW_API_KEY environment variable")
            print("  export ROBOFLOW_API_KEY='your_key_here'")
            print("  Get a key at https://app.roboflow.com/settings/api")
            sys.exit(1)

        rf = Roboflow(api_key=api_key)
        project = rf.workspace("golf-zsfiv").project("golf-club-pose")
        dataset = project.version(1).download("yolov8-pose", location="datasets/golf_club_pose")
        print(f"\nDataset downloaded to: {dataset.location}")
        print(f"Data config: {dataset.location}/data.yaml")
        print(f"\nTo train, use the absolute path:")
        print(f"  yolo pose train ... data={Path(dataset.location).resolve()}/data.yaml")

    except ImportError:
        print("Install roboflow: pip install roboflow")
        sys.exit(1)


def train():
    """Train the YOLOv8-nano-pose model."""
    from ultralytics import YOLO

    # Resolve absolute path to data.yaml (yolo CLI requires it)
    script_dir = Path(__file__).parent
    data_yaml = script_dir / "datasets" / "golf_club_pose" / "data.yaml"
    if not data_yaml.exists():
        print(f"Error: {data_yaml} not found.")
        print("Download a dataset first (see download_dataset()).")
        sys.exit(1)

    config = {**TRAIN_CONFIG, "data": str(data_yaml.resolve())}
    model = YOLO(config["model"])
    model.train(**config)

    print(f"\nTraining complete. Best weights: {BEST_WEIGHTS}")
    print(f"Run 'python {sys.argv[0]} export' to export for mobile.")


def validate():
    """Run validation on the trained model."""
    from ultralytics import YOLO

    if not BEST_WEIGHTS.exists():
        print(f"Error: {BEST_WEIGHTS} not found. Train the model first.")
        sys.exit(1)

    model = YOLO(str(BEST_WEIGHTS))
    results = model.val(data=TRAIN_CONFIG["data"], imgsz=EXPORT_IMGSZ)
    print(f"\nValidation results: {results}")


def export():
    """Export the trained model to CoreML (iOS) and TFLite (Android)."""
    from ultralytics import YOLO

    if not BEST_WEIGHTS.exists():
        print(f"Error: {BEST_WEIGHTS} not found. Train the model first.")
        sys.exit(1)

    model = YOLO(str(BEST_WEIGHTS))

    # iOS — CoreML FP16
    print("\n=== Exporting CoreML (iOS) ===")
    coreml_path = model.export(format="coreml", imgsz=EXPORT_IMGSZ, half=True)
    print(f"CoreML model exported to: {coreml_path}")
    print(f"Copy to: modules/vision-camera-club-detection/ios/golf-club-pose.mlpackage")

    # Android — TFLite FP16 (NOT INT8 — known keypoint accuracy bugs)
    print("\n=== Exporting TFLite (Android) ===")
    tflite_path = model.export(format="tflite", imgsz=EXPORT_IMGSZ, half=True)
    print(f"TFLite model exported to: {tflite_path}")
    print(f"Copy to: modules/vision-camera-club-detection/android/src/main/assets/golf-club-pose.tflite")

    print("\n=== Export complete ===")
    print("Expected model sizes: ~6-7MB per format (YOLOv8n-pose FP16)")
    print()
    print("IMPORTANT: Do NOT use INT8 quantization for TFLite — it breaks keypoint coordinates.")
    print("See: https://github.com/ultralytics/ultralytics/issues/5889")


def main():
    if len(sys.argv) < 2:
        print("Usage: python train.py <command>")
        print()
        print("Commands:")
        print("  download  - Show dataset download instructions")
        print("  train     - Train the YOLOv8-nano-pose model")
        print("  validate  - Run validation on the trained model")
        print("  export    - Export to CoreML + TFLite for mobile")
        sys.exit(0)

    command = sys.argv[1]

    if command == "download":
        download_dataset()
    elif command == "train":
        train()
    elif command == "validate":
        validate()
    elif command == "export":
        export()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
