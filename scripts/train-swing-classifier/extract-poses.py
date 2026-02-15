#!/usr/bin/env python3
"""
Extract MediaPipe Pose landmarks from video frames.

Runs MediaPipe Pose Landmarker (Tasks API) on every frame of each downloaded
video and saves per-clip joint CSVs. These CSVs become the input for
prepare-dataset.py.

Output format per CSV row:
    frame_idx, joint0_x, joint0_y, joint0_conf, joint1_x, joint1_y, joint1_conf, ...

We extract all 33 MediaPipe landmarks but the classifier only uses 8 joints
(shoulders, elbows, wrists, hips). The full set is saved for future use.

Requires the pose_landmarker model file. Download from:
    https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task

Usage:
    python extract-poses.py --metadata ./data/videos/clip_metadata.csv --output-dir ./data/poses
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm

BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode


# MediaPipe landmark names (33 total)
LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear",
    "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky",
    "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# Default model path (relative to this script)
DEFAULT_MODEL_PATH = str(
    Path(__file__).parent.parent.parent
    / "modules"
    / "vision-camera-pose-detection"
    / "ios"
    / "pose_landmarker_lite.task"
)


def build_csv_header() -> list[str]:
    """Build CSV header for all 33 landmarks."""
    header = ["frame_idx"]
    for name in LANDMARK_NAMES:
        header.extend([f"{name}_x", f"{name}_y", f"{name}_visibility"])
    return header


def extract_poses_from_video(
    video_path: str,
    output_csv: str,
    model_path: str,
    frame_start: int = 0,
    frame_end: int | None = None,
) -> int:
    """
    Run MediaPipe Pose Landmarker on frames of a video and save landmarks to CSV.

    Only processes frames in [frame_start, frame_end). If frame_end is None,
    processes to the end of the video.

    Returns the number of frames processed.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  Cannot open video: {video_path}")
        return 0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    actual_end = min(frame_end or total_frames, total_frames)
    actual_start = max(frame_start, 0)
    n_to_process = actual_end - actual_start

    # Use IMAGE mode for non-sequential frame access (seeking skips frames)
    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    landmarker = PoseLandmarker.create_from_options(options)

    # Seek to start frame
    if actual_start > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, actual_start)

    header = build_csv_header()
    rows = []
    frame_idx = actual_start

    pbar = tqdm(total=n_to_process, desc=os.path.basename(video_path), leave=False)

    while frame_idx < actual_end:
        ret, frame = cap.read()
        if not ret:
            break

        # MediaPipe expects RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # Timestamp in milliseconds (must be monotonically increasing for VIDEO mode)
        timestamp_ms = int(frame_idx * 1000.0 / fps) if fps > 0 else frame_idx * 33

        results = landmarker.detect_for_video(mp_image, timestamp_ms)

        row = [frame_idx]

        if results.pose_landmarks and len(results.pose_landmarks) > 0:
            landmarks = results.pose_landmarks[0]  # First (only) pose
            for landmark in landmarks:
                row.extend([
                    round(landmark.x, 6),
                    round(landmark.y, 6),
                    round(landmark.visibility, 4),
                ])
        else:
            # No pose detected — fill with zeros
            row.extend([0.0] * (33 * 3))

        rows.append(row)
        frame_idx += 1
        pbar.update(1)

    pbar.close()
    cap.release()
    landmarker.close()

    # Write CSV
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
    with open(output_csv, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)

    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Extract MediaPipe poses from videos")
    parser.add_argument(
        "--metadata",
        required=True,
        help="Path to clip_metadata.csv from download step",
    )
    parser.add_argument(
        "--output-dir",
        default="./data/poses",
        help="Directory to save pose CSVs",
    )
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Path to pose_landmarker .task model file",
    )
    parser.add_argument(
        "--video-dir",
        default=None,
        help="Override video directory (if videos were moved)",
    )
    parser.add_argument(
        "--margin",
        type=int,
        default=60,
        help="Extra frames before first event and after last event (default: 60)",
    )
    parser.add_argument(
        "--full-video",
        action="store_true",
        help="Process entire video instead of just event region",
    )
    args = parser.parse_args()

    if not os.path.exists(args.model_path):
        print(f"Model file not found: {args.model_path}")
        print("Download from: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")
        sys.exit(1)

    # Read metadata
    with open(args.metadata, "r") as f:
        reader = csv.DictReader(f)
        clips = list(reader)

    print(f"Processing {len(clips)} clips")
    print(f"Model: {args.model_path}")
    if not args.full_video:
        print(f"Frame margin around events: {args.margin}")
    os.makedirs(args.output_dir, exist_ok=True)

    processed = 0
    skipped = 0

    for clip in clips:
        clip_id = clip["id"]
        video_path = clip.get("video_path", "")

        if args.video_dir and video_path:
            # Re-base video path
            video_path = os.path.join(args.video_dir, os.path.basename(video_path))

        if not video_path or not os.path.exists(video_path):
            skipped += 1
            continue

        output_csv = os.path.join(args.output_dir, f"clip_{clip_id}.csv")
        if os.path.exists(output_csv):
            processed += 1
            continue

        # Compute frame range from events
        frame_start = 0
        frame_end = None
        if not args.full_video:
            events_str = clip.get("events", "")
            if events_str:
                try:
                    events = [int(x) for x in events_str.split()]
                    frame_start = max(0, min(events) - args.margin)
                    frame_end = max(events) + args.margin
                except ValueError:
                    pass

        n_frames = extract_poses_from_video(
            video_path=video_path,
            output_csv=output_csv,
            model_path=args.model_path,
            frame_start=frame_start,
            frame_end=frame_end,
        )
        print(f"  Clip {clip_id}: {n_frames} frames [{frame_start}-{frame_end or 'end'}] -> {output_csv}")
        processed += 1

    print(f"\nDone: {processed} processed, {skipped} skipped (no video)")


if __name__ == "__main__":
    main()
