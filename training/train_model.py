#!/usr/bin/env python3
"""
train_model.py — Train MLP emotion classifier from extracted features

Trains a small MLP on the 6 prosody features extracted from RAVDESS:
    Input(6) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)

Target: ≥50% validation accuracy (well above 20% random baseline for 5 classes)

Usage:
    python train_model.py [--features <path>] [--epochs <n>] [--batch-size <n>]

Outputs:
    - emotion_model.h5       — saved Keras model
    - training_history.png   — accuracy/loss curves (if matplotlib available)
    - confusion_matrix.png   — per-class performance visualization
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# Try importing matplotlib for visualizations (optional)
try:
    import matplotlib.pyplot as plt
    import seaborn as sns
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


# ── Constants ───────────────────────────────────────────────────────────────
FEATURE_NAMES = [
    'meanPitch',
    'pitchVariance',
    'energy',
    'spectralCentroid',
    'zeroCrossingRate',
    'speechRate'
]

# Emotion order MUST match emotion-detector.js EMOTION_LABELS
EMOTION_LABELS = ['calm', 'stressed', 'happy', 'sad', 'neutral']


def load_features(csv_path):
    """Load features CSV and return X (features), y (labels)."""
    df = pd.read_csv(csv_path)
    
    # Check required columns
    missing = [f for f in FEATURE_NAMES if f not in df.columns]
    if missing:
        print(f"Error: Missing feature columns: {missing}")
        sys.exit(1)
    
    if 'emotion' not in df.columns:
        print("Error: 'emotion' column not found in features CSV")
        sys.exit(1)
    
    X = df[FEATURE_NAMES].values.astype(np.float32)
    y_labels = df['emotion'].values
    
    print(f"Loaded {len(df)} samples with {X.shape[1]} features")
    print(f"Emotion distribution:\n{pd.Series(y_labels).value_counts().sort_index()}")
    
    return X, y_labels


def encode_labels(y_labels):
    """
    Encode string labels to integers, ensuring order matches EMOTION_LABELS.
    
    Returns:
        y_encoded (np.array), label_encoder (LabelEncoder)
    """
    # Create encoder with fixed class order
    encoder = LabelEncoder()
    encoder.classes_ = np.array(EMOTION_LABELS)
    
    y_encoded = encoder.transform(y_labels)
    
    print(f"\nLabel encoding:")
    for i, label in enumerate(EMOTION_LABELS):
        count = np.sum(y_encoded == i)
        print(f"  {i}: {label:10s} ({count} samples)")
    
    return y_encoded, encoder


def build_model(input_dim=6, num_classes=5):
    """
    Build the MLP architecture:
        Input(6) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)
    """
    model = keras.Sequential([
        layers.Input(shape=(input_dim,)),
        layers.Dense(32, activation='relu', name='hidden1'),
        layers.Dense(16, activation='relu', name='hidden2'),
        layers.Dense(num_classes, activation='softmax', name='output')
    ], name='emotion_classifier')
    
    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model


def plot_training_history(history, output_dir):
    """Plot training/validation accuracy and loss curves."""
    if not HAS_MATPLOTLIB:
        print("Matplotlib not available, skipping training history plot")
        return
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    
    # Accuracy
    ax1.plot(history.history['accuracy'], label='Train')
    ax1.plot(history.history['val_accuracy'], label='Validation')
    ax1.set_xlabel('Epoch')
    ax1.set_ylabel('Accuracy')
    ax1.set_title('Model Accuracy')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Loss
    ax2.plot(history.history['loss'], label='Train')
    ax2.plot(history.history['val_loss'], label='Validation')
    ax2.set_xlabel('Epoch')
    ax2.set_ylabel('Loss')
    ax2.set_title('Model Loss')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    out_path = Path(output_dir) / 'training_history.png'
    plt.savefig(out_path, dpi=150)
    print(f"Saved training history plot to {out_path}")
    plt.close()


def plot_confusion_matrix(y_true, y_pred, labels, output_dir):
    """Plot confusion matrix heatmap."""
    if not HAS_MATPLOTLIB:
        print("Matplotlib not available, skipping confusion matrix plot")
        return
    
    cm = confusion_matrix(y_true, y_pred)
    
    plt.figure(figsize=(8, 6))
    sns.heatmap(
        cm, annot=True, fmt='d', cmap='Blues',
        xticklabels=labels, yticklabels=labels
    )
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    
    out_path = Path(output_dir) / 'confusion_matrix.png'
    plt.savefig(out_path, dpi=150)
    print(f"Saved confusion matrix to {out_path}")
    plt.close()


def train_and_evaluate(X, y, epochs=50, batch_size=32, output_dir='.'):
    """
    Train the model with 80/20 train/val split and evaluate performance.
    """
    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\nTrain samples: {len(X_train)}")
    print(f"Validation samples: {len(X_val)}")
    
    # Build model
    model = build_model(input_dim=X.shape[1], num_classes=len(EMOTION_LABELS))
    model.summary()
    
    # Train
    print("\n=== Training ===")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        verbose=1
    )
    
    # Evaluate
    print("\n=== Evaluation ===")
    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
    print(f"Validation Loss: {val_loss:.4f}")
    print(f"Validation Accuracy: {val_acc:.4f} ({val_acc*100:.1f}%)")
    
    if val_acc < 0.50:
        print("\n⚠️  Warning: Validation accuracy below 50% target")
    else:
        print(f"\n✓ Target met: {val_acc*100:.1f}% ≥ 50%")
    
    # Per-class metrics
    y_pred = np.argmax(model.predict(X_val, verbose=0), axis=1)
    
    print("\n=== Classification Report ===")
    print(classification_report(y_val, y_pred, target_names=EMOTION_LABELS, digits=3))
    
    # Save model
    model_path = Path(output_dir) / 'emotion_model.h5'
    model.save(model_path)
    print(f"\nSaved Keras model to {model_path}")
    
    # Plot results
    plot_training_history(history, output_dir)
    plot_confusion_matrix(y_val, y_pred, EMOTION_LABELS, output_dir)
    
    return model, history


def main():
    parser = argparse.ArgumentParser(description='Train emotion classifier MLP')
    parser.add_argument(
        '--features',
        default='features.csv',
        help='Path to features CSV (default: features.csv)'
    )
    parser.add_argument(
        '--epochs',
        type=int,
        default=50,
        help='Number of training epochs (default: 50)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=32,
        help='Training batch size (default: 32)'
    )
    parser.add_argument(
        '--output-dir',
        default='.',
        help='Output directory for saved model (default: current dir)'
    )
    
    args = parser.parse_args()
    
    if not Path(args.features).exists():
        print(f"Error: Features file not found: {args.features}")
        sys.exit(1)
    
    # Set random seeds for reproducibility
    np.random.seed(42)
    tf.random.set_seed(42)
    
    # Load data
    X, y_labels = load_features(args.features)
    
    # Encode labels
    y, label_encoder = encode_labels(y_labels)
    
    # Train
    model, history = train_and_evaluate(
        X, y,
        epochs=args.epochs,
        batch_size=args.batch_size,
        output_dir=args.output_dir
    )
    
    print("\n✓ Training complete!")


if __name__ == '__main__':
    main()
