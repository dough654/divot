#!/usr/bin/env python3
"""
Export PyTorch model weights to JSON for JS inference.

Converts all model parameters to nested arrays that can be loaded as
Float32Arrays in TypeScript. Also produces a reference output for a
test input to validate the JS forward pass matches PyTorch.

Usage:
    python export-weights.py --model ./models/best_model.pt --output ./exported

Output files:
    weights.json      -- All model weights as nested number arrays
    reference.json    -- Test input + expected output for JS unit tests
    swing-classifier-weights.ts -- TypeScript file ready to copy into src/utils/
"""

import argparse
import json
import os

import numpy as np
import torch

from train import SwingClassifier1DCNN, PHASES


def tensor_to_nested_list(t: torch.Tensor) -> list:
    """Convert a PyTorch tensor to a nested Python list of floats."""
    return t.detach().cpu().numpy().tolist()


def export_weights(model: SwingClassifier1DCNN) -> dict:
    """
    Extract all model weights into a JSON-serializable dict.

    Weight naming convention matches the JS inference code:
        conv1_weight, conv1_bias, bn1_weight, bn1_bias, bn1_running_mean, bn1_running_var, ...

    Skips num_batches_tracked (not used by JS inference).
    Flattens conv weights from (out, in, kernel) to (out, in*kernel) for the JS ModelWeights type.
    """
    state = model.state_dict()

    weights = {}
    for key, tensor in state.items():
        # Skip batch norm tracking counters (not needed for inference)
        if "num_batches_tracked" in key:
            continue

        js_key = key.replace(".", "_")

        # Flatten 3D conv weights (out, in, kernel) -> 2D (out, in*kernel) to match JS ModelWeights type
        if tensor.dim() == 3:
            tensor = tensor.reshape(tensor.shape[0], -1)

        weights[js_key] = tensor_to_nested_list(tensor)

    return weights


def generate_reference_output(model: SwingClassifier1DCNN) -> dict:
    """
    Generate a deterministic test input and its expected output.

    This is used by the JS unit tests to verify the forward pass matches.
    """
    model.eval()

    # Deterministic test input: a simple pattern
    np.random.seed(42)
    test_input = np.random.randn(1, 30, 16).astype(np.float32) * 0.1

    with torch.no_grad():
        x = torch.from_numpy(test_input)
        logits = model(x)
        probs = torch.softmax(logits, dim=1)

    return {
        "input": test_input[0].tolist(),  # (30, 16)
        "expected_logits": logits[0].tolist(),  # (7,)
        "expected_probs": probs[0].tolist(),  # (7,)
        "expected_class": int(logits.argmax(dim=1).item()),
        "phases": PHASES,
    }


def generate_typescript_file(weights: dict, output_path: str):
    """
    Generate a TypeScript file with weights as typed array initializers.

    Imports ModelWeights from the swing-classifier module to ensure type compatibility.
    """
    total_params = sum(np.prod(np.array(v).shape) for v in weights.values())
    lines = [
        "/**",
        " * Auto-generated swing classifier weights.",
        " * Do not edit manually -- regenerate with export-weights.py.",
        " *",
        f" * Model: 1D CNN, {total_params:,} parameters",
        " */",
        "",
        "/* eslint-disable */",
        "",
        "import type { ModelWeights } from './swing-classifier';",
        "",
        "/**",
        " * Whether these are real trained weights or placeholders.",
        " * Check this before trusting classifier output.",
        " */",
        "export const WEIGHTS_ARE_TRAINED = true;",
        "",
        "export const SWING_CLASSIFIER_WEIGHTS: ModelWeights = {",
    ]

    for key, value in weights.items():
        json_value = json.dumps(value, separators=(",", ":"))
        lines.append(f"  {key}: {json_value},")

    lines.extend([
        "};",
        "",
    ])

    with open(output_path, "w") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Export model weights to JSON/TypeScript")
    parser.add_argument("--model", required=True, help="Path to best_model.pt")
    parser.add_argument("--output", default="./exported", help="Output directory")
    parser.add_argument("--n-features", type=int, default=16)
    parser.add_argument("--n-classes", type=int, default=7)
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)

    # Load model
    model = SwingClassifier1DCNN(n_features=args.n_features, n_classes=args.n_classes)
    model.load_state_dict(torch.load(args.model, map_location="cpu", weights_only=True))
    model.eval()
    print(f"Model loaded: {model.param_count():,} params")

    # Export weights
    weights = export_weights(model)
    weights_path = os.path.join(args.output, "weights.json")
    with open(weights_path, "w") as f:
        json.dump(weights, f)
    file_size_kb = os.path.getsize(weights_path) / 1024
    print(f"Weights saved to {weights_path} ({file_size_kb:.1f} KB)")

    # Generate reference output for testing
    reference = generate_reference_output(model)
    reference_path = os.path.join(args.output, "reference.json")
    with open(reference_path, "w") as f:
        json.dump(reference, f, indent=2)
    print(f"Reference output saved to {reference_path}")

    # Generate TypeScript file
    ts_path = os.path.join(args.output, "swing-classifier-weights.ts")
    generate_typescript_file(weights, ts_path)
    print(f"TypeScript file saved to {ts_path}")
    print(f"  Copy to: src/utils/swing-classifier-weights.ts")

    # Summary
    print(f"\nWeight shapes:")
    for key, value in weights.items():
        arr = np.array(value)
        print(f"  {key}: {arr.shape}")


if __name__ == "__main__":
    main()
