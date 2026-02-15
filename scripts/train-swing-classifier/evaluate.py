#!/usr/bin/env python3
"""
Evaluate trained swing classifier on test data and optional range session videos.

Produces confusion matrix, per-class accuracy, and timing analysis.

Usage:
    python evaluate.py --model ./models/best_model.pt --dataset-dir ./data/dataset

    # Optional: evaluate on range session videos
    python evaluate.py --model ./models/best_model.pt --dataset-dir ./data/dataset \
        --range-videos ./data/range_sessions/ --range-poses ./data/range_poses/
"""

import argparse
import json
import os

import numpy as np
import torch
import matplotlib.pyplot as plt
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay

# Import model class from train module
from train import SwingClassifier1DCNN, PHASES


def plot_confusion_matrix(cm: np.ndarray, labels: list[str], output_path: str):
    """Save confusion matrix as an image."""
    fig, ax = plt.subplots(figsize=(10, 8))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    disp.plot(ax=ax, cmap="Blues", values_format="d")
    plt.title("Swing Phase Classifier - Confusion Matrix")
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Confusion matrix saved to {output_path}")


def plot_per_class_accuracy(cm: np.ndarray, labels: list[str], output_path: str):
    """Save per-class accuracy bar chart."""
    per_class_acc = cm.diagonal() / cm.sum(axis=1).clip(min=1)

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(range(len(labels)), per_class_acc, color="#4CAF50")
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_ylabel("Accuracy")
    ax.set_title("Per-Class Accuracy")
    ax.set_ylim(0, 1.0)

    # Add value labels on bars
    for bar, acc in zip(bars, per_class_acc):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.02,
            f"{acc:.2f}",
            ha="center",
            va="bottom",
            fontsize=10,
        )

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"Per-class accuracy saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate swing classifier")
    parser.add_argument("--model", required=True, help="Path to best_model.pt")
    parser.add_argument("--dataset-dir", required=True, help="Directory with test.npz")
    parser.add_argument("--output-dir", default="./results", help="Output directory for plots")
    parser.add_argument("--n-features", type=int, default=16)
    parser.add_argument("--n-classes", type=int, default=7)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Load model
    model = SwingClassifier1DCNN(n_features=args.n_features, n_classes=args.n_classes)
    model.load_state_dict(torch.load(args.model, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    print(f"Model loaded: {model.param_count():,} params")

    # Load test data
    test_data = np.load(os.path.join(args.dataset_dir, "test.npz"))
    X_test = torch.from_numpy(test_data["X"]).float().to(device)
    y_test = test_data["y"]

    print(f"Test set: {len(y_test)} windows")

    # Run inference
    with torch.no_grad():
        logits = model(X_test)
        probs = torch.softmax(logits, dim=1).cpu().numpy()
        preds = logits.argmax(dim=1).cpu().numpy()

    # Metrics
    accuracy = (preds == y_test).mean()
    print(f"\nOverall Accuracy: {accuracy:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, preds, target_names=PHASES))

    # Confusion matrix
    cm = confusion_matrix(y_test, preds)
    plot_confusion_matrix(cm, PHASES, os.path.join(args.output_dir, "confusion_matrix.png"))
    plot_per_class_accuracy(cm, PHASES, os.path.join(args.output_dir, "per_class_accuracy.png"))

    # Confidence analysis — average confidence for correct vs incorrect predictions
    correct_mask = preds == y_test
    max_probs = probs.max(axis=1)

    print(f"\nConfidence Analysis:")
    print(f"  Correct predictions:   avg confidence = {max_probs[correct_mask].mean():.3f}")
    if (~correct_mask).any():
        print(f"  Incorrect predictions: avg confidence = {max_probs[~correct_mask].mean():.3f}")

    # Per-class confidence
    print(f"\nPer-Class Confidence (correct predictions only):")
    for i, phase in enumerate(PHASES):
        mask = (y_test == i) & correct_mask
        if mask.any():
            avg_conf = max_probs[mask].mean()
            print(f"  {phase:>16s}: {avg_conf:.3f}")

    # Save results
    results = {
        "overall_accuracy": float(accuracy),
        "per_class_accuracy": {
            phase: float(cm[i, i] / max(cm[i].sum(), 1))
            for i, phase in enumerate(PHASES)
        },
        "confusion_matrix": cm.tolist(),
        "test_size": len(y_test),
    }
    results_path = os.path.join(args.output_dir, "results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {results_path}")


if __name__ == "__main__":
    main()
