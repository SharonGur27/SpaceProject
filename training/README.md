# RAVDESS Emotion Classifier Training Pipeline

This directory contains the Python training pipeline for the **Dekel emotion detection model**.

The pipeline extracts audio prosody features from the RAVDESS dataset, trains a small MLP classifier, and exports the model to TensorFlow.js format for browser deployment.

---

## Overview

**Goal:** Train a lightweight emotion classifier that runs in the browser and predicts 5 emotional states from voice prosody.

**Model Architecture:**
```
Input(6) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)
```

**Features (6):**
1. Mean Pitch (F0) — fundamental frequency in Hz
2. Pitch Variance — std deviation of pitch
3. Energy (RMS) — root mean square amplitude
4. Spectral Centroid — "brightness" of the voice
5. Zero Crossing Rate — sign changes per sample
6. Speech Rate Proxy — tempo-based syllable estimate

**Emotion Classes (5):**
- `calm` — relaxed, low energy
- `stressed` — angry, fearful, disgusted
- `happy` — joyful, surprised
- `sad` — low mood, melancholic
- `neutral` — baseline emotional state

**Target Performance:** ≥50% validation accuracy (well above 20% random baseline)

---

## Dataset: RAVDESS

The **Ryerson Audio-Visual Database of Emotional Speech and Song (RAVDESS)** contains 1440 audio files from 24 actors expressing 8 emotions.

**Download:**
- Official site: [https://zenodo.org/record/1188976](https://zenodo.org/record/1188976)
- Unzip into a directory (e.g., `RAVDESS/`)
- Expected structure:
  ```
  RAVDESS/
    Actor_01/
      03-01-01-01-01-01-01.wav
      03-01-01-01-01-01-02.wav
      ...
    Actor_02/
      ...
  ```

**Filename Format:**
```
{modality}-{vocal_channel}-{emotion}-{intensity}-{statement}-{repetition}-{actor}.wav
```

Example: `03-01-05-02-01-01-01.wav`
- `03` = audio-video
- `01` = speech (not song)
- `05` = angry emotion
- `02` = high intensity
- `01` = statement 1 ("Kids are talking by the door")
- `01` = first repetition
- `01` = Actor 01

**Emotion Codes → Our Labels:**
| RAVDESS | Emotion   | Our Label   |
|---------|-----------|-------------|
| 01      | neutral   | `neutral`   |
| 02      | calm      | `calm`      |
| 03      | happy     | `happy`     |
| 04      | sad       | `sad`       |
| 05      | angry     | `stressed`  |
| 06      | fearful   | `stressed`  |
| 07      | disgust   | `stressed`  |
| 08      | surprised | `happy`     |

---

## Setup

**1. Install Python dependencies:**

```bash
pip install -r requirements.txt
```

Requirements:
- Python 3.8+
- `librosa` (audio feature extraction)
- `tensorflow` (model training)
- `tensorflowjs` (model export)
- `scikit-learn`, `numpy`, `pandas`
- `matplotlib`, `seaborn` (optional, for plots)

**2. Download RAVDESS dataset** (see above)

---

## Pipeline Steps

### Step 1: Extract Features

```bash
python extract_features.py /path/to/RAVDESS --output-dir .
```

**Inputs:**
- RAVDESS directory with `Actor_XX` subdirectories

**Outputs:**
- `features.csv` — feature vectors + emotion labels (one row per audio file)
- `normalization.json` — mean & std for z-score normalization (needed in browser)

**What it does:**
- Loads each `.wav` file
- Extracts 6 prosody features using `librosa`
- Maps RAVDESS emotion codes to our 5-class labels
- Computes normalization statistics (mean, std per feature)
- Saves features as CSV for training

**Expected runtime:** ~5-10 minutes for full RAVDESS dataset (1440 files)

---

### Step 2: Train Model

```bash
python train_model.py --features features.csv --epochs 50 --batch-size 32
```

**Inputs:**
- `features.csv` (from Step 1)

**Outputs:**
- `emotion_model.h5` — trained Keras model
- `training_history.png` — accuracy/loss curves (if matplotlib available)
- `confusion_matrix.png` — per-class performance heatmap

**What it does:**
- Loads feature vectors and labels
- Splits data 80/20 train/validation (stratified)
- Builds MLP: Input(6) → Dense(32) → Dense(16) → Dense(5)
- Trains with Adam optimizer, categorical crossentropy loss
- Evaluates on validation set
- Reports per-class precision, recall, F1-score
- Saves trained model as `.h5`

**Expected runtime:** ~2-5 minutes on CPU (50 epochs)

**Command-line options:**
- `--features <path>` — path to features CSV (default: `features.csv`)
- `--epochs <n>` — number of training epochs (default: 50)
- `--batch-size <n>` — training batch size (default: 32)
- `--output-dir <dir>` — where to save model (default: current dir)

---

### Step 3: Export to TensorFlow.js

```bash
python export_tfjs.py --model emotion_model.h5 --norm-stats normalization.json --output-dir ../src/model
```

**Inputs:**
- `emotion_model.h5` (from Step 2)
- `normalization.json` (from Step 1)

**Outputs (to `../src/model/`):**
- `model.json` — TF.js model architecture + weights manifest
- `group1-shard*of*.bin` — model weight shards
- `normalization.json` — feature normalization stats (for browser)

**What it does:**
- Converts Keras `.h5` model to TF.js format using `tensorflowjs_converter`
- Copies normalization stats to model directory
- Verifies the exported model loads correctly

**Expected runtime:** ~10-30 seconds

**Command-line options:**
- `--model <path>` — path to Keras model (default: `emotion_model.h5`)
- `--norm-stats <path>` — path to normalization.json (default: `normalization.json`)
- `--output-dir <dir>` — where to save TF.js model (default: `../src/model`)

---

## Full Workflow Example

```bash
# 1. Extract features from RAVDESS
python extract_features.py ~/datasets/RAVDESS --output-dir .

# 2. Train the model
python train_model.py --features features.csv --epochs 50

# 3. Export to TensorFlow.js
python export_tfjs.py --model emotion_model.h5 --output-dir ../src/model
```

After this, the `../src/model/` directory will contain:
- `model.json`
- `group1-shard1of1.bin` (or multiple shards)
- `normalization.json`

These files are ready to be loaded by `emotion-detector.js` in the browser.

---

## Integration with Browser Code

**1. Update normalization stats in `audio-features.js`:**

The browser code has placeholder normalization stats. Replace `DEFAULT_NORM_STATS` in `src/js/audio-features.js` with the values from `training/normalization.json`, or call:

```javascript
import { setNormalizationStats } from './audio-features.js';

const response = await fetch('../model/normalization.json');
const stats = await response.json();
setNormalizationStats(stats);
```

**2. Load the model in `emotion-detector.js`:**

```javascript
import { loadModel } from './emotion-detector.js';

await loadModel('../model/model.json');
```

The model is now ready to predict emotions from live audio features.

---

## Notes

### Feature Extraction Details

**Pitch (F0):**
- Detected using `librosa.pyin` (probabilistic YIN algorithm)
- More robust to noise than autocorrelation
- Filters out unvoiced frames (NaN values)

**Energy (RMS):**
- Root mean square amplitude over time
- Correlates with loudness and intensity

**Spectral Centroid:**
- "Center of mass" of the frequency spectrum
- Higher centroid = brighter, more energetic voice

**Zero Crossing Rate:**
- Fraction of samples where the signal changes sign
- Higher ZCR = noisier, more fricative speech (often stressed)

**Speech Rate Proxy:**
- Estimated from onset detection (energy peaks)
- Tempo in beats per minute, converted to syllables/sec
- Approximation of speaking speed

### Model Architecture Justification

**Why this architecture?**
- **Small footprint:** 6 → 32 → 16 → 5 = ~1200 parameters, <50 KB model
- **Fast inference:** Runs in <5ms in browser on modern hardware
- **Sufficient capacity:** 2 hidden layers capture nonlinear feature interactions
- **Softmax output:** Returns probability distribution over 5 emotions

**Why ReLU activation?**
- Standard for hidden layers; prevents vanishing gradients
- Sparse activation (only positive neurons fire)

**Why Adam optimizer?**
- Adaptive learning rate per parameter
- Works well with small datasets
- Minimal hyperparameter tuning needed

### Known Limitations

1. **RAVDESS is acted speech:** Professional actors simulating emotions. Real-world spontaneous speech may differ in prosody.

2. **Limited data:** 1440 clips (after mapping → ~300 per class). More data would improve generalization.

3. **Prosody-only:** No lexical (word choice) or semantic (meaning) features. The model cannot detect sarcasm or context-dependent emotions.

4. **Speaker variability:** RAVDESS has 24 actors. Real users' voices may differ in pitch range, accent, etc.

**Mitigation:**
- Confidence thresholds (0.55 / 0.40) filter low-confidence predictions
- Fallback to rule-based classifier when uncertain
- Normalization stats adapt features to typical ranges

---

## Troubleshooting

**Issue:** `No .wav files found in RAVDESS directory`
- **Fix:** Ensure the path points to the root containing `Actor_XX` subdirectories

**Issue:** `tensorflowjs_converter not found`
- **Fix:** Run `pip install tensorflowjs`

**Issue:** `Validation accuracy below 50%`
- **Possible causes:**
  - Dataset too small (use full RAVDESS, not a subset)
  - Feature extraction failed (check for NaN values in `features.csv`)
  - Class imbalance (check emotion distribution in Step 1 output)
- **Try:**
  - Increase training epochs: `--epochs 100`
  - Check for errors in Step 1 logs
  - Verify `features.csv` has ~1440 rows

**Issue:** Model won't load in browser
- **Fix:** Check browser console for errors. Ensure `model.json` and weight shards are in the same directory and accessible via HTTP (not `file://`).

---

## File Reference

| File                    | Purpose                                      |
|-------------------------|----------------------------------------------|
| `extract_features.py`   | Extract 6 features from RAVDESS → CSV + JSON |
| `train_model.py`        | Train MLP classifier, save as `.h5`          |
| `export_tfjs.py`        | Convert Keras model to TF.js format          |
| `requirements.txt`      | Python dependencies                          |
| `README.md`             | This file                                    |

**Generated files (after running pipeline):**
- `features.csv` — feature vectors + labels
- `normalization.json` — mean & std per feature
- `emotion_model.h5` — trained Keras model
- `training_history.png` — accuracy/loss plot
- `confusion_matrix.png` — per-class heatmap
- `../src/model/model.json` — TF.js model (for browser)
- `../src/model/group1-shard*.bin` — model weights
- `../src/model/normalization.json` — normalization stats (for browser)

---

## Contact

Built by **Chewie, ML/Audio Engineer** for the Dekel project.

Questions? Check `.squad/agents/chewie/history.md` for project context or `.squad/decisions.md` for architectural decisions.
