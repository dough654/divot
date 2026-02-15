#!/usr/bin/env python3
"""
Prepare training dataset from extracted poses and GolfDB annotations.

Takes per-clip pose CSVs and the GolfDB annotation metadata, creates sliding
windows of joint trajectories, labels each window with the current swing phase,
balances classes, and produces train/val/test splits.

GolfDB event mapping to our 7 phases:
    Before Address frame         -> idle
    Address frame (+/-5 frames)  -> address
    Address -> Top               -> backswing
    Top -> Impact                -> downswing
    Impact frame (+/-2 frames)   -> impact
    Impact -> Finish             -> follow_through
    Finish frame (+/-5 frames)   -> finish

Output: .npz files with X (windows) and y (labels) arrays.

Usage:
    python prepare-dataset.py \
        --poses-dir ./data/poses \
        --metadata ./data/videos/clip_metadata.csv \
        --output-dir ./data/dataset
"""

import argparse
import csv
import os

import numpy as np
from sklearn.model_selection import train_test_split


# Phase labels
PHASES = ["idle", "address", "backswing", "downswing", "impact", "follow_through", "finish"]
PHASE_TO_IDX = {phase: i for i, phase in enumerate(PHASES)}

# 8 classifier joints: shoulders, elbows, wrists, hips
# MediaPipe landmark indices for these joints
CLASSIFIER_JOINT_INDICES = [
    11,  # left_shoulder
    12,  # right_shoulder
    13,  # left_elbow
    14,  # right_elbow
    15,  # left_wrist
    16,  # right_wrist
    23,  # left_hip
    24,  # right_hip
]

# Window parameters
WINDOW_SIZE = 30  # frames
WINDOW_STRIDE = 3  # frames (small stride to capture short phases like impact)


def events_to_frame_labels(events: list[int], total_frames: int) -> np.ndarray:
    """
    Convert GolfDB 8-event annotations to per-frame phase labels.

    GolfDB events (0-indexed frame numbers):
        0: address
        1: toe-up (backswing)
        2: mid-backswing
        3: top
        4: mid-downswing
        5: impact
        6: mid-follow-through
        7: finish

    Our mapping:
        idle: before address - 5
        address: events[0] +/- 5
        backswing: address+6 to top (events[3])
        downswing: top+1 to impact-3 (events[5])
        impact: events[5] +/- 2
        follow_through: impact+3 to finish-6 (events[7])
        finish: events[7] +/- 5
    """
    labels = np.full(total_frames, PHASE_TO_IDX["idle"], dtype=np.int64)

    address_frame = events[0]
    top_frame = events[3]
    impact_frame = events[5]
    finish_frame = events[7]

    # Address zone: +/- 5 frames
    addr_start = max(0, address_frame - 5)
    addr_end = min(total_frames, address_frame + 6)
    labels[addr_start:addr_end] = PHASE_TO_IDX["address"]

    # Backswing: after address zone to top
    bs_start = addr_end
    bs_end = min(total_frames, top_frame + 1)
    if bs_start < bs_end:
        labels[bs_start:bs_end] = PHASE_TO_IDX["backswing"]

    # Downswing: top+1 to just before impact zone
    ds_start = bs_end
    impact_zone_start = max(ds_start, impact_frame - 2)
    if ds_start < impact_zone_start:
        labels[ds_start:impact_zone_start] = PHASE_TO_IDX["downswing"]

    # Impact zone: +/- 2 frames
    imp_start = max(0, impact_frame - 2)
    imp_end = min(total_frames, impact_frame + 3)
    labels[imp_start:imp_end] = PHASE_TO_IDX["impact"]

    # Follow-through: after impact zone to just before finish zone
    ft_start = imp_end
    finish_zone_start = max(ft_start, finish_frame - 5)
    if ft_start < finish_zone_start:
        labels[ft_start:finish_zone_start] = PHASE_TO_IDX["follow_through"]

    # Finish zone: +/- 5 frames
    fin_start = max(0, finish_frame - 5)
    fin_end = min(total_frames, finish_frame + 6)
    labels[fin_start:fin_end] = PHASE_TO_IDX["finish"]

    return labels


def load_pose_csv(csv_path: str) -> tuple[np.ndarray, int] | None:
    """
    Load pose CSV and extract the 8 classifier joints.

    Returns (features, frame_offset) where:
      - features: array of shape (n_frames, 16) — 8 joints x 2 coords (x, y)
      - frame_offset: the first frame index in the CSV (CSVs may not start at 0)
    Confidence values are used for filtering but not included in the feature vector.
    """
    try:
        data = np.genfromtxt(csv_path, delimiter=",", skip_header=1)
    except Exception as e:
        print(f"  Failed to load {csv_path}: {e}")
        return None

    if data.ndim != 2 or data.shape[1] < 100:  # frame_idx + 33*3 = 100
        print(f"  Unexpected shape in {csv_path}: {data.shape}")
        return None

    n_frames = data.shape[0]
    frame_offset = int(data[0, 0])  # First frame index in the CSV
    features = np.zeros((n_frames, len(CLASSIFIER_JOINT_INDICES) * 2), dtype=np.float32)

    for i, mp_idx in enumerate(CLASSIFIER_JOINT_INDICES):
        # CSV columns: frame_idx, then 33 * (x, y, visibility)
        # Column for joint mp_idx: 1 + mp_idx * 3 (x), 1 + mp_idx * 3 + 1 (y)
        col_x = 1 + mp_idx * 3
        col_y = 1 + mp_idx * 3 + 1
        col_vis = 1 + mp_idx * 3 + 2

        x = data[:, col_x].copy()
        y = data[:, col_y].copy()
        vis = data[:, col_vis]

        # Zero out low-confidence joints (< 0.3)
        mask = vis < 0.3
        x[mask] = 0.0
        y[mask] = 0.0

        features[:, i * 2] = x
        features[:, i * 2 + 1] = y

    return features, frame_offset


def create_windows(
    features: np.ndarray,
    labels: np.ndarray,
    window_size: int = WINDOW_SIZE,
    stride: int = WINDOW_STRIDE,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Create sliding windows from frame features and labels.

    Window label = center frame's label. The surrounding frames provide temporal
    context for classifying what's happening at the center. This ensures short
    phases like impact (~5 frames) and downswing (~10-15 frames) get represented,
    unlike mode-based labeling where they'd be drowned out by longer phases.

    Returns (X, y) where X has shape (n_windows, window_size, n_features)
    and y has shape (n_windows,).
    """
    n_frames = features.shape[0]
    if n_frames < window_size:
        return np.empty((0, window_size, features.shape[1])), np.empty(0, dtype=np.int64)

    windows_X = []
    windows_y = []
    center_offset = window_size // 2

    for start in range(0, n_frames - window_size + 1, stride):
        end = start + window_size
        window_features = features[start:end]

        # Label = center frame's phase
        window_label = labels[start + center_offset]

        windows_X.append(window_features)
        windows_y.append(window_label)

    return np.array(windows_X, dtype=np.float32), np.array(windows_y, dtype=np.int64)


def balance_classes(X: np.ndarray, y: np.ndarray, max_ratio: float = 3.0) -> tuple[np.ndarray, np.ndarray]:
    """
    Balance classes by oversampling minority classes and capping majority classes.

    max_ratio: maximum ratio between largest and smallest class.
    """
    classes, counts = np.unique(y, return_counts=True)
    target_count = int(np.median(counts) * max_ratio)
    target_count = max(target_count, int(np.max(counts) * 0.5))

    balanced_X = []
    balanced_y = []

    for cls in classes:
        mask = y == cls
        cls_X = X[mask]
        cls_y = y[mask]
        n = len(cls_y)

        if n >= target_count:
            # Downsample
            indices = np.random.choice(n, target_count, replace=False)
            balanced_X.append(cls_X[indices])
            balanced_y.append(cls_y[indices])
        else:
            # Keep all + oversample to reach reasonable count
            oversample_target = min(target_count, n * 3)  # Don't oversample more than 3x
            balanced_X.append(cls_X)
            balanced_y.append(cls_y)
            if oversample_target > n:
                extra = oversample_target - n
                indices = np.random.choice(n, extra, replace=True)
                balanced_X.append(cls_X[indices])
                balanced_y.append(cls_y[indices])

    X_balanced = np.concatenate(balanced_X, axis=0)
    y_balanced = np.concatenate(balanced_y, axis=0)

    # Shuffle
    perm = np.random.permutation(len(y_balanced))
    return X_balanced[perm], y_balanced[perm]


def main():
    parser = argparse.ArgumentParser(description="Prepare swing classifier dataset")
    parser.add_argument("--poses-dir", required=True, help="Directory with pose CSVs")
    parser.add_argument("--metadata", required=True, help="clip_metadata.csv from download step")
    parser.add_argument("--output-dir", default="./data/dataset", help="Output directory")
    parser.add_argument("--window-size", type=int, default=WINDOW_SIZE)
    parser.add_argument("--window-stride", type=int, default=WINDOW_STRIDE)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--balance", action="store_true", default=True, help="Balance classes")
    args = parser.parse_args()

    np.random.seed(args.seed)
    os.makedirs(args.output_dir, exist_ok=True)

    # Read metadata
    with open(args.metadata, "r") as f:
        reader = csv.DictReader(f)
        clips = list(reader)

    print(f"Processing {len(clips)} clips")

    all_X = []
    all_y = []
    all_splits = []  # GolfDB train/test split

    for clip in clips:
        clip_id = clip["id"]
        events_str = clip.get("events", "")
        split = int(clip.get("split", 0))

        if not events_str:
            continue

        try:
            events = [int(x) for x in events_str.split()]
        except ValueError:
            continue

        if len(events) != 8:
            continue

        # Load pose CSV
        pose_csv = os.path.join(args.poses_dir, f"clip_{clip_id}.csv")
        if not os.path.exists(pose_csv):
            continue

        result = load_pose_csv(pose_csv)
        if result is None:
            continue

        features, frame_offset = result
        n_frames = features.shape[0]

        # Adjust events relative to the CSV's frame offset
        adjusted_events = [e - frame_offset for e in events]

        # Skip clips where adjusted events are out of bounds
        if max(adjusted_events) >= n_frames or min(adjusted_events) < 0:
            print(f"  Clip {clip_id}: events out of CSV range (offset={frame_offset}, n_frames={n_frames}), skipping")
            continue

        # Create per-frame labels using adjusted events
        labels = events_to_frame_labels(adjusted_events, n_frames)

        # Create windows
        X, y = create_windows(features, labels, args.window_size, args.window_stride)
        if len(y) == 0:
            continue

        all_X.append(X)
        all_y.append(y)
        all_splits.extend([split] * len(y))

        print(f"  Clip {clip_id}: {n_frames} frames -> {len(y)} windows")

    if not all_X:
        print("No data produced. Check that pose CSVs exist and events are valid.")
        sys.exit(1)

    X_all = np.concatenate(all_X, axis=0)
    y_all = np.concatenate(all_y, axis=0)
    splits = np.array(all_splits)

    print(f"\nTotal: {len(y_all)} windows")
    print("Class distribution:")
    for i, phase in enumerate(PHASES):
        count = np.sum(y_all == i)
        print(f"  {phase}: {count} ({count / len(y_all) * 100:.1f}%)")

    # Split using GolfDB's 4-fold cross-validation splits
    # We use split 1 as test set (~25%), splits 2-4 as train/val
    test_mask = splits == 1
    train_val_mask = ~test_mask

    X_train_val = X_all[train_val_mask]
    y_train_val = y_all[train_val_mask]
    X_test = X_all[test_mask]
    y_test = y_all[test_mask]

    # If no GolfDB split info, use random split
    if len(X_test) == 0:
        X_train_val, X_test, y_train_val, y_test = train_test_split(
            X_all, y_all, test_size=0.15, random_state=args.seed, stratify=y_all,
        )

    # Split train_val into train and val
    # Use stratified split if all classes have enough samples, otherwise fall back to random
    min_class_count = min(np.sum(y_train_val == i) for i in range(len(PHASES)))
    use_stratify = min_class_count >= 2
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=0.15, random_state=args.seed,
        stratify=y_train_val if use_stratify else None,
    )
    if not use_stratify:
        print(f"  Warning: some classes have <2 samples in train_val, using non-stratified split")

    # Balance training set
    if args.balance:
        print("\nBalancing training set...")
        X_train, y_train = balance_classes(X_train, y_train)
        print("Post-balance training class distribution:")
        for i, phase in enumerate(PHASES):
            count = np.sum(y_train == i)
            print(f"  {phase}: {count}")

    print(f"\nSplits: train={len(y_train)}, val={len(y_val)}, test={len(y_test)}")

    # Save
    np.savez_compressed(
        os.path.join(args.output_dir, "train.npz"), X=X_train, y=y_train,
    )
    np.savez_compressed(
        os.path.join(args.output_dir, "val.npz"), X=X_val, y=y_val,
    )
    np.savez_compressed(
        os.path.join(args.output_dir, "test.npz"), X=X_test, y=y_test,
    )

    # Save metadata
    meta = {
        "phases": PHASES,
        "window_size": args.window_size,
        "window_stride": args.window_stride,
        "n_joints": len(CLASSIFIER_JOINT_INDICES),
        "joint_indices": CLASSIFIER_JOINT_INDICES,
        "n_features": len(CLASSIFIER_JOINT_INDICES) * 2,
        "train_size": len(y_train),
        "val_size": len(y_val),
        "test_size": len(y_test),
    }
    np.savez(os.path.join(args.output_dir, "metadata.npz"), **meta)

    print(f"\nDataset saved to {args.output_dir}")


if __name__ == "__main__":
    main()
