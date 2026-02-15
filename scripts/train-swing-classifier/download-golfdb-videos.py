#!/usr/bin/env python3
"""
Download GolfDB video clips for swing classifier training.

Filters the GolfDB annotation CSV for down-the-line (DTL), real-time clips,
then downloads the corresponding YouTube videos via yt-dlp and trims to the
annotated bounding box time range.

Usage:
    python download-golfdb-videos.py --golfdb-csv ../golfdb-repo/data/golfDB.csv --output-dir ./data/videos

The GolfDB CSV columns:
    id, youtube_id, player, sex, club, view, slow, events (8 frame indices), bbox, split

We filter for: view == 'dtl' AND slow == 0 (real-time)
"""

import argparse
import csv
import os
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np


def parse_golfdb_csv(csv_path: str) -> list[dict]:
    """Parse GolfDB CSV and filter for DTL real-time clips."""
    clips = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Filter: DTL view, real-time (not slow motion)
            if row.get("view", "").strip().lower() != "dtl":
                continue
            if row.get("slow", "1").strip() != "0":
                continue

            # Parse event frame indices (8 events)
            events_str = row.get("events", "").strip()
            if not events_str:
                continue

            # Events are stored as space-separated integers in brackets
            events_str = events_str.strip("[]")
            try:
                events = [int(x) for x in events_str.split()]
            except ValueError:
                print(f"  Skipping clip {row.get('id', '?')}: bad events format")
                continue

            if len(events) != 8:
                print(f"  Skipping clip {row.get('id', '?')}: expected 8 events, got {len(events)}")
                continue

            clips.append({
                "id": int(row["id"]),
                "youtube_id": row["youtube_id"].strip(),
                "player": row.get("player", "unknown").strip(),
                "club": row.get("club", "unknown").strip(),
                "view": row["view"].strip(),
                "events": events,
                "split": int(row.get("split", 0)),
                "bbox": row.get("bbox", "").strip(),
            })

    return clips


def download_video(youtube_id: str, output_dir: str) -> str | None:
    """
    Download a YouTube video at 360p max. Returns the output path, or None on failure.

    Uses yt-dlp with format selection for reasonable quality without huge files.
    """
    output_path = os.path.join(output_dir, f"{youtube_id}.mp4")
    if os.path.exists(output_path):
        return output_path

    url = f"https://www.youtube.com/watch?v={youtube_id}"
    cmd = [
        "yt-dlp",
        "-f", "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", output_path,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        url,
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return output_path
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"  Failed to download {youtube_id}: {e}")
        return None


def parse_bbox(bbox_str: str) -> tuple[int, int, int, int] | None:
    """Parse bbox string '[x1, y1, x2, y2]' into a tuple."""
    if not bbox_str:
        return None
    try:
        bbox_str = bbox_str.strip("[]")
        parts = [int(x.strip()) for x in bbox_str.split(",")]
        if len(parts) == 4:
            return tuple(parts)  # type: ignore
    except ValueError:
        pass
    return None


def main():
    parser = argparse.ArgumentParser(description="Download GolfDB DTL real-time clips")
    parser.add_argument(
        "--golfdb-csv",
        required=True,
        help="Path to golfDB.csv",
    )
    parser.add_argument(
        "--output-dir",
        default="./data/videos",
        help="Directory to save downloaded videos",
    )
    parser.add_argument(
        "--max-clips",
        type=int,
        default=0,
        help="Max clips to download (0 = all)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Number of parallel download workers",
    )
    args = parser.parse_args()

    # Parse and filter
    clips = parse_golfdb_csv(args.golfdb_csv)
    print(f"Found {len(clips)} DTL real-time clips in GolfDB")

    if args.max_clips > 0:
        clips = clips[: args.max_clips]
        print(f"Limiting to {args.max_clips} clips")

    # Get unique YouTube IDs (multiple clips can come from the same video)
    unique_ids = list({c["youtube_id"] for c in clips})
    print(f"Unique YouTube videos to download: {len(unique_ids)}")

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # Download videos in parallel
    downloaded = {}
    failed = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(download_video, yt_id, args.output_dir): yt_id
            for yt_id in unique_ids
        }

        for i, future in enumerate(as_completed(futures)):
            yt_id = futures[future]
            result = future.result()
            if result:
                downloaded[yt_id] = result
                print(f"  [{i+1}/{len(unique_ids)}] Downloaded {yt_id}")
            else:
                failed.append(yt_id)
                print(f"  [{i+1}/{len(unique_ids)}] FAILED {yt_id}")

    # Save clip metadata with download status
    metadata_path = os.path.join(args.output_dir, "clip_metadata.csv")
    with open(metadata_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "youtube_id", "player", "club", "view", "events", "split", "bbox", "video_path"],
        )
        writer.writeheader()
        for clip in clips:
            video_path = downloaded.get(clip["youtube_id"], "")
            writer.writerow({
                **clip,
                "events": " ".join(str(e) for e in clip["events"]),
                "video_path": video_path,
            })

    print(f"\nDone: {len(downloaded)} downloaded, {len(failed)} failed")
    print(f"Metadata saved to {metadata_path}")

    if failed:
        print(f"\nFailed YouTube IDs ({len(failed)}):")
        for yt_id in failed:
            print(f"  {yt_id}")


if __name__ == "__main__":
    main()
