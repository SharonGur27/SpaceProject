#!/usr/bin/env python3
"""
export_tfjs.py — Export Keras model to TensorFlow.js format

Converts the trained Keras model to TF.js format for browser deployment.
Also copies normalization stats to the output directory.

Usage:
    python export_tfjs.py [--model <path>] [--norm-stats <path>] [--output-dir <dir>]

Outputs (to output_dir):
    - model.json             — TF.js model architecture + weights manifest
    - group1-shard*of*.bin   — model weight shards
    - normalization.json     — feature normalization stats (for browser)
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def convert_model_to_tfjs(keras_model_path, output_dir):
    """
    Convert Keras .h5 model to TensorFlow.js format using tensorflowjs_converter.
    
    Args:
        keras_model_path: path to .h5 Keras model
        output_dir: where to save TF.js artifacts
    """
    keras_path = Path(keras_model_path)
    output_path = Path(output_dir)
    
    if not keras_path.exists():
        print(f"Error: Keras model not found: {keras_path}")
        sys.exit(1)
    
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"Converting {keras_path} to TensorFlow.js format...")
    print(f"Output directory: {output_path}")
    
    # Run tensorflowjs_converter
    cmd = [
        'tensorflowjs_converter',
        '--input_format', 'keras',
        str(keras_path),
        str(output_path)
    ]
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(result.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Error running tensorflowjs_converter:")
        print(e.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print("Error: tensorflowjs_converter not found.")
        print("Install with: pip install tensorflowjs")
        sys.exit(1)
    
    # Verify output files exist
    model_json = output_path / 'model.json'
    if not model_json.exists():
        print(f"Error: Expected output {model_json} not found")
        sys.exit(1)
    
    print(f"\n✓ Model converted successfully")
    print(f"  - model.json: {model_json}")
    
    # List weight shards
    weight_files = list(output_path.glob('group*.bin'))
    for wf in weight_files:
        print(f"  - {wf.name}")
    
    return model_json


def copy_normalization_stats(norm_stats_path, output_dir):
    """
    Copy normalization.json to the output directory.
    
    The browser code needs these stats to z-score normalize features before
    feeding them to the model.
    """
    norm_path = Path(norm_stats_path)
    output_path = Path(output_dir)
    
    if not norm_path.exists():
        print(f"Warning: Normalization stats not found: {norm_path}")
        print("Browser code will use default normalization stats.")
        return
    
    dest = output_path / 'normalization.json'
    shutil.copy(norm_path, dest)
    print(f"\n✓ Copied normalization stats to {dest}")
    
    # Display stats for verification
    with open(dest, 'r') as f:
        stats = json.load(f)
    
    print("\nNormalization statistics:")
    for feat, vals in stats.items():
        print(f"  {feat:20s}: mean={vals['mean']:8.2f}, std={vals['std']:8.2f}")


def verify_model_loads(model_json_path):
    """
    Attempt to load the TF.js model using Python TensorFlow.js to verify it's valid.
    """
    print("\n=== Verifying exported model ===")
    
    try:
        import tensorflow as tf
        import tensorflowjs as tfjs
        
        model = tfjs.converters.load_keras_model(str(model_json_path))
        print(f"✓ Model loaded successfully")
        
        # Print summary
        model.summary()
        
        # Test prediction with dummy input
        import numpy as np
        dummy_input = np.random.randn(1, 6).astype(np.float32)
        output = model.predict(dummy_input, verbose=0)
        print(f"\nTest prediction output shape: {output.shape}")
        print(f"Output (softmax probabilities): {output[0]}")
        print(f"Sum of probabilities: {output[0].sum():.4f} (should be ~1.0)")
        
    except ImportError:
        print("Skipping verification (tensorflowjs Python package not available)")
    except Exception as e:
        print(f"Warning: Verification failed: {e}")
        print("The model may still work in the browser. Test manually.")


def main():
    parser = argparse.ArgumentParser(description='Export Keras model to TensorFlow.js')
    parser.add_argument(
        '--model',
        default='emotion_model.h5',
        help='Path to Keras .h5 model (default: emotion_model.h5)'
    )
    parser.add_argument(
        '--norm-stats',
        default='normalization.json',
        help='Path to normalization.json (default: normalization.json)'
    )
    parser.add_argument(
        '--output-dir',
        default='../src/model',
        help='Output directory for TF.js model (default: ../src/model)'
    )
    
    args = parser.parse_args()
    
    # Convert model
    model_json = convert_model_to_tfjs(args.model, args.output_dir)
    
    # Copy normalization stats
    copy_normalization_stats(args.norm_stats, args.output_dir)
    
    # Verify
    verify_model_loads(model_json)
    
    print("\n" + "="*60)
    print("Export complete!")
    print("="*60)
    print(f"\nNext steps:")
    print(f"  1. Copy {args.output_dir} to your web server")
    print(f"  2. Update emotion-detector.js DEFAULT_MODEL_URL if needed")
    print(f"  3. Test in browser with live audio input")


if __name__ == '__main__':
    main()
