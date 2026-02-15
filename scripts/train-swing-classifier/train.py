#!/usr/bin/env python3
"""
Train a 1D temporal CNN for golf swing phase classification.

Architecture:
    Input:  (batch, 30, 16) — 30 frames x 8 joints x 2 coords
    Conv1D(16->32, k=5) + ReLU + BatchNorm
    Conv1D(32->64, k=5) + ReLU + BatchNorm
    Conv1D(64->64, k=3) + ReLU + BatchNorm
    GlobalAveragePooling1D
    Dense(64->32) + ReLU + Dropout(0.3)
    Dense(32->7) + Softmax

~16K params. Trains in minutes on CPU.

Usage:
    python train.py --dataset-dir ./data/dataset --output-dir ./models
"""

import argparse
import json
import os

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import classification_report, confusion_matrix


PHASES = ["idle", "address", "backswing", "downswing", "impact", "follow_through", "finish"]


class SwingClassifier1DCNN(nn.Module):
    """
    1D temporal CNN for swing phase classification.

    Input shape: (batch, seq_len=30, features=16)
    Output shape: (batch, 7)
    """

    def __init__(self, n_features: int = 16, n_classes: int = 7):
        super().__init__()

        # PyTorch Conv1d expects (batch, channels, seq_len)
        self.conv1 = nn.Conv1d(n_features, 32, kernel_size=5, padding=2)
        self.bn1 = nn.BatchNorm1d(32)

        self.conv2 = nn.Conv1d(32, 64, kernel_size=5, padding=2)
        self.bn2 = nn.BatchNorm1d(64)

        self.conv3 = nn.Conv1d(64, 64, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(64)

        self.fc1 = nn.Linear(64, 32)
        self.dropout = nn.Dropout(0.3)
        self.fc2 = nn.Linear(32, n_classes)

        self.relu = nn.ReLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, features) -> (batch, features, seq_len)
        x = x.permute(0, 2, 1)

        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.relu(self.bn3(self.conv3(x)))

        # Global average pooling: (batch, 64, seq_len) -> (batch, 64)
        x = x.mean(dim=2)

        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)

        return x

    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())


def load_dataset(dataset_dir: str) -> tuple:
    """Load train/val/test splits from .npz files."""
    train = np.load(os.path.join(dataset_dir, "train.npz"))
    val = np.load(os.path.join(dataset_dir, "val.npz"))
    test = np.load(os.path.join(dataset_dir, "test.npz"))

    return (
        (train["X"], train["y"]),
        (val["X"], val["y"]),
        (test["X"], test["y"]),
    )


def create_dataloader(
    X: np.ndarray, y: np.ndarray, batch_size: int, shuffle: bool = True,
) -> DataLoader:
    """Create a PyTorch DataLoader from numpy arrays."""
    X_tensor = torch.from_numpy(X).float()
    y_tensor = torch.from_numpy(y).long()
    dataset = TensorDataset(X_tensor, y_tensor)
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle)


def train_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
) -> tuple[float, float]:
    """Train for one epoch. Returns (avg_loss, accuracy)."""
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)

        optimizer.zero_grad()
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * len(y_batch)
        correct += (logits.argmax(dim=1) == y_batch).sum().item()
        total += len(y_batch)

    return total_loss / total, correct / total


def evaluate_model(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
) -> tuple[float, float, np.ndarray, np.ndarray]:
    """Run model on a dataset. Returns (avg_loss, accuracy, all_preds, all_labels)."""
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for X_batch, y_batch in loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)

            logits = model(X_batch)
            loss = criterion(logits, y_batch)

            preds = logits.argmax(dim=1)
            total_loss += loss.item() * len(y_batch)
            correct += (preds == y_batch).sum().item()
            total += len(y_batch)

            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(y_batch.cpu().numpy())

    return (
        total_loss / total,
        correct / total,
        np.array(all_preds),
        np.array(all_labels),
    )


def main():
    parser = argparse.ArgumentParser(description="Train swing classifier")
    parser.add_argument("--dataset-dir", required=True, help="Directory with train/val/test .npz")
    parser.add_argument("--output-dir", default="./models", help="Directory to save model")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=15, help="Early stopping patience")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Load data
    (X_train, y_train), (X_val, y_val), (X_test, y_test) = load_dataset(args.dataset_dir)
    print(f"Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")

    n_features = X_train.shape[2]  # Should be 16
    n_classes = len(PHASES)

    train_loader = create_dataloader(X_train, y_train, args.batch_size, shuffle=True)
    val_loader = create_dataloader(X_val, y_val, args.batch_size, shuffle=False)
    test_loader = create_dataloader(X_test, y_test, args.batch_size, shuffle=False)

    # Create model
    model = SwingClassifier1DCNN(n_features=n_features, n_classes=n_classes).to(device)
    print(f"Model parameters: {model.param_count():,}")

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=7, factor=0.5)

    # Training loop with early stopping
    os.makedirs(args.output_dir, exist_ok=True)
    best_val_acc = 0.0
    patience_counter = 0
    best_model_path = os.path.join(args.output_dir, "best_model.pt")

    for epoch in range(args.epochs):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc, _, _ = evaluate_model(model, val_loader, criterion, device)
        scheduler.step(val_loss)

        lr = optimizer.param_groups[0]["lr"]
        print(
            f"Epoch {epoch+1:3d}/{args.epochs} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} | "
            f"LR: {lr:.6f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), best_model_path)
            print(f"  -> New best val acc: {val_acc:.4f}")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"\nEarly stopping at epoch {epoch+1}")
                break

    # Load best model and run on test set
    model.load_state_dict(torch.load(best_model_path, weights_only=True))
    test_loss, test_acc, test_preds, test_labels = evaluate_model(model, test_loader, criterion, device)

    print(f"\n{'='*60}")
    print(f"Test Loss: {test_loss:.4f} | Test Accuracy: {test_acc:.4f}")
    print(f"{'='*60}")
    print("\nClassification Report:")
    print(classification_report(test_labels, test_preds, target_names=PHASES))

    print("Confusion Matrix:")
    cm = confusion_matrix(test_labels, test_preds)
    # Print with labels
    print(f"{'':>16s}", end="")
    for phase in PHASES:
        print(f"{phase[:8]:>9s}", end="")
    print()
    for i, phase in enumerate(PHASES):
        print(f"{phase:>16s}", end="")
        for j in range(len(PHASES)):
            print(f"{cm[i, j]:>9d}", end="")
        print()

    # Save training metadata
    meta = {
        "phases": PHASES,
        "n_features": n_features,
        "n_classes": n_classes,
        "best_val_accuracy": float(best_val_acc),
        "test_accuracy": float(test_acc),
        "param_count": model.param_count(),
        "architecture": "1D-CNN: Conv(16->32,k5) Conv(32->64,k5) Conv(64->64,k3) GAP Dense(64->32) Dense(32->7)",
    }
    with open(os.path.join(args.output_dir, "training_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nModel saved to {best_model_path}")
    print(f"Metadata saved to {os.path.join(args.output_dir, 'training_meta.json')}")


if __name__ == "__main__":
    main()
