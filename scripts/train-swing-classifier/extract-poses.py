#!/usr/bin/env python3
"""
Extract MediaPipe Pose landmarks from video frames.

Runs MediaPipe Pose on every frame of each downloaded video and saves
per-clip joint CSVs. These CSVs become the input for prepare-dataset.py.

Output format per CSV row:
    frame_idx, joint0_x, joint0_y, joint0_conf, joint1_x, joint1_y, joint1_conf, ...

We extract all 33 MediaPipe landmarks but the classifier only uses 8 joints
(shoulders, elbows, wrists, hips). The full set is saved for future use.

Usage:
    python extract-poses.py --metadata ./data/videos/clip_metadata.csv --output-dir ./data/poses
"""

import argparse
import csv
import os
import sys

import cv2
import mediapipe as mp
import numpy as np
from tqdm import tqdm


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

# MediaPipe indices for the 14 joints we map to our app's joint model
# These map to pose-normalization.ts JOINT_NAMES
OUR_14_JOINT_INDICES = {
    "nose": 0,
    "neck": None,  # Computed as midpoint of shoulders (11, 12)
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
}


def build_csv_header() -> list[str]:
    """Build CSV header for all 33 landmarks."""
    header = ["frame_idx"]
    for name in LANDMARK_NAMES:
        header.extend([f"{name}_x", f"{name}_y", f"{name}_visibility"])
    return header


def extract_poses_from_video(
    video_path: str,
    output_csv: str,
    model_complexity: int = 1,
) -> int:
    """
    Run MediaPipe Pose on every frame of a video and save landmarks to CSV.

    Returns the number of frames processed.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  Cannot open video: {video_path}")
        return 0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=model_complexity,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    header = build_csv_header()
    rows = []
    frame_idx = 0

    pbar = tqdm(total=total_frames, desc=os.path.basename(video_path), leave=False)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # MediaPipe expects RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)

        row = [frame_idx]

        if results.pose_landmarks:
            for landmark in results.pose_landmarks.landmark:
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
    pose.close()

    # Write CSV
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
    with open(output_csv, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)

    return frame_idx


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
        "--model-complexity",
        type=int,
        default=1,
        choices=[0, 1, 2],
        help="MediaPipe model complexity (0=lite, 1=full, 2=heavy)",
    )
    parser.add_argument(
        "--video-dir",
        default=None,
        help="Override video directory (if videos were moved)",
    )
    args = parser.parse_args()

    # Read metadata
    with open(args.metadata, "r") as f:
        reader = csv.DictReader(f)
        clips = list(reader)

    print(f"Processing {len(clips)} clips")
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

        n_frames = extract_poses_from_video(
            video_path=video_path,
            output_csv=output_csv,
            model_complexity=args.model_complexity,
        )
        print(f"  Clip {clip_id}: {n_frames} frames -> {output_csv}")
        processed += 1

    print(f"\nDone: {processed} processed, {skipped} skipped (no video)")


if __name__ == "__main__":
    main()
