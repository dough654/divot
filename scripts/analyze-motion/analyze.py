"""
Analyze frame-to-frame motion magnitude in golf swing videos.

Replicates the exact algorithm from FrameDiffComputer.swift:
1. Convert frame to grayscale (Y/luminance channel)
2. Downsample: every 4th pixel in both dimensions
3. Compute absolute difference from previous frame
4. Normalize: totalAbsDiff / (sampleCount * 255) → 0.0 to 1.0

Outputs a CSV of (frame, timestamp_sec, motion_magnitude) and a plot.

Usage:
    python analyze.py <video_file> [--fps-sample 15] [--stride 4] [--plot]
    python analyze.py videos/*.mp4 --plot

The --fps-sample flag controls how many frames per second to sample
(matching the 15 Hz polling rate of the app). Set to 0 to use every frame.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import cv2
import numpy as np


def compute_motion_series(
    video_path: str,
    stride: int = 4,
    fps_sample: float = 15.0,
) -> list[dict]:
    """Run frame differencing on a video file, return per-frame motion data."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Cannot open {video_path}")
        return []

    video_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / video_fps if video_fps > 0 else 0

    print(f"  Video: {video_fps:.1f} fps, {total_frames} frames, {duration:.1f}s")

    # Frame skip to match target sample rate
    frame_skip = max(1, int(round(video_fps / fps_sample))) if fps_sample > 0 else 1
    effective_fps = video_fps / frame_skip
    print(f"  Sampling every {frame_skip} frame(s) → ~{effective_fps:.1f} Hz")

    previous_luminance = None
    results = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_skip != 0:
            frame_idx += 1
            continue

        timestamp = frame_idx / video_fps

        # Convert to grayscale (equivalent to Y plane extraction)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Downsample: every Nth pixel in both dimensions
        downsampled = gray[::stride, ::stride]
        current_luminance = downsampled.flatten().astype(np.int16)

        if previous_luminance is not None and len(current_luminance) == len(previous_luminance):
            # Absolute difference, same as Swift code
            diff = np.abs(current_luminance - previous_luminance)
            total_diff = np.sum(diff)
            max_possible = len(current_luminance) * 255.0
            motion_magnitude = float(total_diff) / max_possible

            results.append({
                "frame": frame_idx,
                "timestamp": round(timestamp, 3),
                "motion": round(motion_magnitude, 6),
            })

        previous_luminance = current_luminance
        frame_idx += 1

    cap.release()
    return results


def write_csv(results: list[dict], output_path: str):
    """Write motion data to CSV."""
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["frame", "timestamp", "motion"])
        writer.writeheader()
        writer.writerows(results)
    print(f"  CSV: {output_path}")


def plot_motion(results: list[dict], video_name: str, output_path: str):
    """Generate a motion magnitude plot with threshold reference lines."""
    import matplotlib.pyplot as plt

    timestamps = [r["timestamp"] for r in results]
    motions = [r["motion"] for r in results]

    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(timestamps, motions, linewidth=0.5, color="#2196F3", alpha=0.8)

    # Current thresholds from our config
    ax.axhline(y=0.01, color="green", linestyle="--", linewidth=1, alpha=0.7, label="stillness threshold (0.01)")
    ax.axhline(y=0.04, color="orange", linestyle="--", linewidth=1, alpha=0.7, label="swing threshold (0.04)")
    ax.axhline(y=0.06, color="red", linestyle="--", linewidth=1, alpha=0.7, label="initial trigger (0.06)")

    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("Motion Magnitude (0-1)")
    ax.set_title(f"Frame Diff Motion — {video_name}")
    ax.legend(loc="upper right")
    ax.set_ylim(0, min(0.15, max(motions) * 1.2) if motions else 0.15)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"  Plot: {output_path}")


def print_stats(results: list[dict], video_name: str):
    """Print summary statistics."""
    if not results:
        print(f"  No data for {video_name}")
        return

    motions = [r["motion"] for r in results]
    arr = np.array(motions)

    print(f"\n  Stats for {video_name}:")
    print(f"    Samples:    {len(motions)}")
    print(f"    Min:        {arr.min():.6f}")
    print(f"    Max:        {arr.max():.6f}")
    print(f"    Mean:       {arr.mean():.6f}")
    print(f"    Median:     {np.median(arr):.6f}")
    print(f"    Std:        {arr.std():.6f}")
    print(f"    P10:        {np.percentile(arr, 10):.6f}")
    print(f"    P25:        {np.percentile(arr, 25):.6f}")
    print(f"    P75:        {np.percentile(arr, 75):.6f}")
    print(f"    P90:        {np.percentile(arr, 90):.6f}")
    print(f"    P95:        {np.percentile(arr, 95):.6f}")
    print(f"    P99:        {np.percentile(arr, 99):.6f}")

    # Count frames above/below thresholds
    still = np.sum(arr < 0.01)
    swing = np.sum(arr > 0.04)
    trigger = np.sum(arr > 0.06)
    print(f"    < 0.01 (still):     {still} ({100*still/len(motions):.1f}%)")
    print(f"    > 0.04 (swing):     {swing} ({100*swing/len(motions):.1f}%)")
    print(f"    > 0.06 (trigger):   {trigger} ({100*trigger/len(motions):.1f}%)")


def main():
    parser = argparse.ArgumentParser(description="Analyze frame motion in golf videos")
    parser.add_argument("videos", nargs="+", help="Video file(s) to analyze")
    parser.add_argument("--fps-sample", type=float, default=15.0, help="Sample rate in Hz (0 = every frame)")
    parser.add_argument("--stride", type=int, default=4, help="Downsample stride (default: 4)")
    parser.add_argument("--plot", action="store_true", help="Generate motion plot")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory (default: same as video)")
    args = parser.parse_args()

    for video_path in args.videos:
        if not os.path.exists(video_path):
            print(f"Skipping {video_path}: file not found")
            continue

        video_name = Path(video_path).stem
        output_dir = args.output_dir or str(Path(video_path).parent)
        os.makedirs(output_dir, exist_ok=True)

        print(f"\nAnalyzing: {video_path}")
        results = compute_motion_series(video_path, stride=args.stride, fps_sample=args.fps_sample)

        if not results:
            continue

        csv_path = os.path.join(output_dir, f"{video_name}_motion.csv")
        write_csv(results, csv_path)
        print_stats(results, video_name)

        if args.plot:
            plot_path = os.path.join(output_dir, f"{video_name}_motion.png")
            plot_motion(results, video_name, plot_path)


if __name__ == "__main__":
    main()
