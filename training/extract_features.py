#!/usr/bin/env python3
"""
extract_features.py — Extract audio features from RAVDESS dataset

Extracts the same 6 prosody features used in audio-features.js:
  [0] Mean Pitch (F0)       — fundamental frequency
  [1] Pitch Variance        — std deviation of pitch
  [2] Energy (RMS)          — root mean square amplitude
  [3] Spectral Centroid     — weighted mean of spectrum
  [4] Zero Crossing Rate    — sign changes per sample
  [5] Speech Rate Proxy     — tempo-based syllable estimate

Outputs:
  - features.csv           — feature vectors + emotion labels
  - normalization.json     — mean & std for z-score normalization (for browser)

Usage:
    python extract_features.py <ravdess_dir> [--output-dir <dir>]

RAVDESS filename format:
    {modality}-{vocal_channel}-{emotion}-{intensity}-{statement}-{repetition}-{actor}.wav
    Example: 03-01-05-02-01-01-01.wav
             └─ modality=03 (audio-video), emotion=05 (angry), etc.

Emotion mapping (RAVDESS → 5 classes):
    01 (neutral)   → neutral
    02 (calm)      → calm
    03 (happy)     → happy
    04 (sad)       → sad
    05 (angry)     → stressed
    06 (fearful)   → stressed
    07 (disgust)   → stressed
    08 (surprised) → happy
"""

import argparse
import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import pandas as pd


# ── Emotion mapping ─────────────────────────────────────────────────────────
# RAVDESS uses codes 01-08. We map them to our 5-class set.
EMOTION_MAP = {
    '01': 'neutral',
    '02': 'calm',
    '03': 'happy',
    '04': 'sad',
    '05': 'stressed',  # angry
    '06': 'stressed',  # fearful
    '07': 'stressed',  # disgust
    '08': 'happy',     # surprised
}

# Feature order MUST match audio-features.js:
# [pitch, pitchVar, energy, centroid, zcr, speechRate]
FEATURE_NAMES = [
    'meanPitch',
    'pitchVariance',
    'energy',
    'spectralCentroid',
    'zeroCrossingRate',
    'speechRate'
]


def extract_features_from_file(filepath):
    """
    Extract 6 prosody features from a single audio file.
    
    Returns:
        dict with keys matching FEATURE_NAMES, or None if extraction fails
    """
    try:
        # Load audio at native sample rate (RAVDESS is 48 kHz)
        y, sr = librosa.load(filepath, sr=None, mono=True)
        
        if len(y) == 0:
            print(f"Warning: empty audio file {filepath}")
            return None
        
        # ── 1. Pitch (F0) via librosa.pyin ─────────────────────────────────
        # pyin is a probabilistic YIN pitch tracker — more robust than autocorrelation
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y, fmin=librosa.note_to_hz('C2'),   # ~65 Hz
            fmax=librosa.note_to_hz('C6'),      # ~1047 Hz (covers human voice range)
            sr=sr
        )
        
        # Filter out unvoiced frames (NaN values)
        f0_clean = f0[~np.isnan(f0)]
        
        if len(f0_clean) < 2:
            # No voiced frames detected → default pitch
            mean_pitch = 0
            pitch_var = 0
        else:
            mean_pitch = float(np.mean(f0_clean))
            pitch_var = float(np.std(f0_clean))
        
        # ── 2. Energy (RMS) ─────────────────────────────────────────────────
        rms = librosa.feature.rms(y=y)[0]  # returns 2D array, take first row
        mean_energy = float(np.mean(rms))
        
        # ── 3. Spectral Centroid ────────────────────────────────────────────
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        mean_centroid = float(np.mean(centroid))
        
        # ── 4. Zero Crossing Rate ───────────────────────────────────────────
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mean_zcr = float(np.mean(zcr))
        
        # ── 5. Speech Rate Proxy (tempo via onset strength) ────────────────
        # Count onset events (energy peaks) per second as a syllable proxy
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        
        # Tempo is in BPM; convert to approximate syllables/sec
        # (rough heuristic: tempo/60 gives beats per second)
        speech_rate = float(tempo / 60.0) if tempo > 0 else 0.0
        
        return {
            'meanPitch': mean_pitch,
            'pitchVariance': pitch_var,
            'energy': mean_energy,
            'spectralCentroid': mean_centroid,
            'zeroCrossingRate': mean_zcr,
            'speechRate': speech_rate
        }
        
    except Exception as e:
        print(f"Error extracting features from {filepath}: {e}")
        return None


def parse_ravdess_filename(filename):
    """
    Parse RAVDESS filename to extract emotion code.
    
    Format: {modality}-{vocal_channel}-{emotion}-{intensity}-{statement}-{repetition}-{actor}.wav
    
    Returns:
        emotion_code (str) or None if parsing fails
    """
    parts = filename.replace('.wav', '').split('-')
    if len(parts) < 3:
        return None
    emotion_code = parts[2]  # third field is emotion
    return emotion_code


def process_dataset(ravdess_dir, output_dir):
    """
    Process all RAVDESS audio files, extract features, and save results.
    
    Args:
        ravdess_dir: path to RAVDESS root directory (contains Actor_XX folders)
        output_dir: where to save features.csv and normalization.json
    """
    ravdess_path = Path(ravdess_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Collect all .wav files from Actor_XX subdirectories
    wav_files = list(ravdess_path.rglob('*.wav'))
    
    if len(wav_files) == 0:
        print(f"Error: No .wav files found in {ravdess_dir}")
        print("Expected structure: {ravdess_dir}/Actor_XX/*.wav")
        sys.exit(1)
    
    print(f"Found {len(wav_files)} audio files in {ravdess_dir}")
    
    data_rows = []
    skipped = 0
    
    for i, wav_path in enumerate(wav_files):
        if (i + 1) % 100 == 0:
            print(f"Processing {i + 1}/{len(wav_files)}...")
        
        # Parse emotion from filename
        emotion_code = parse_ravdess_filename(wav_path.name)
        if emotion_code not in EMOTION_MAP:
            print(f"Warning: unknown emotion code {emotion_code} in {wav_path.name}")
            skipped += 1
            continue
        
        emotion_label = EMOTION_MAP[emotion_code]
        
        # Extract features
        features = extract_features_from_file(str(wav_path))
        if features is None:
            skipped += 1
            continue
        
        # Build row
        row = {**features, 'emotion': emotion_label, 'filename': wav_path.name}
        data_rows.append(row)
    
    print(f"\nExtracted features from {len(data_rows)} files ({skipped} skipped)")
    
    if len(data_rows) == 0:
        print("Error: No features extracted. Exiting.")
        sys.exit(1)
    
    # ── Save features as CSV ────────────────────────────────────────────────
    df = pd.DataFrame(data_rows)
    features_csv = output_path / 'features.csv'
    df.to_csv(features_csv, index=False)
    print(f"Saved features to {features_csv}")
    
    # ── Compute normalization statistics ────────────────────────────────────
    # Calculate mean and std for each feature (excluding emotion, filename)
    norm_stats = {}
    for feat in FEATURE_NAMES:
        mean_val = float(df[feat].mean())
        std_val = float(df[feat].std())
        norm_stats[feat] = {'mean': mean_val, 'std': std_val}
    
    norm_json = output_path / 'normalization.json'
    with open(norm_json, 'w') as f:
        json.dump(norm_stats, f, indent=2)
    print(f"Saved normalization stats to {norm_json}")
    
    # ── Print summary ───────────────────────────────────────────────────────
    print("\n=== Feature Statistics ===")
    for feat in FEATURE_NAMES:
        print(f"{feat:20s}: mean={norm_stats[feat]['mean']:8.2f}, std={norm_stats[feat]['std']:8.2f}")
    
    print("\n=== Emotion Distribution ===")
    print(df['emotion'].value_counts().sort_index())
    
    print("\nFeature extraction complete!")


def main():
    parser = argparse.ArgumentParser(
        description='Extract audio features from RAVDESS dataset',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        'ravdess_dir',
        help='Path to RAVDESS root directory (contains Actor_XX folders)'
    )
    parser.add_argument(
        '--output-dir',
        default='.',
        help='Output directory for features.csv and normalization.json (default: current dir)'
    )
    
    args = parser.parse_args()
    
    if not os.path.isdir(args.ravdess_dir):
        print(f"Error: {args.ravdess_dir} is not a valid directory")
        sys.exit(1)
    
    process_dataset(args.ravdess_dir, args.output_dir)


if __name__ == '__main__':
    main()
