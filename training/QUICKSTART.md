# Quick Start Guide — Training Pipeline

Created by: **Chewie, ML/Audio Engineer**
Date: 2026-04-07

---

## TL;DR — Complete Workflow

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Download RAVDESS dataset from https://zenodo.org/record/1188976
# Extract to a local directory (e.g., ~/datasets/RAVDESS/)

# 3. Extract audio features
python extract_features.py ~/datasets/RAVDESS --output-dir .

# 4. Train the emotion classifier
python train_model.py --features features.csv --epochs 50

# 5. Export model to TensorFlow.js format
python export_tfjs.py --model emotion_model.h5 --output-dir ../src/model

# Done! Model ready in ../src/model/
```

---

## What You Get

After running the pipeline:

**Training artifacts (in `training/` directory):**
- `features.csv` — 1440 rows × 6 features + emotion labels
- `normalization.json` — mean & std per feature for z-score normalization
- `emotion_model.h5` — trained Keras model (~50 KB)
- `training_history.png` — accuracy/loss curves over epochs
- `confusion_matrix.png` — per-class performance heatmap

**Browser-ready model (in `src/model/` directory):**
- `model.json` — TF.js model architecture + weight manifest
- `group1-shard1of1.bin` — model weights (~40 KB)
- `normalization.json` — feature normalization stats for browser

---

## Expected Performance

- **Validation accuracy:** 50-65% (5-class classification)
- **Baseline (random):** 20%
- **Training time:** 2-5 minutes on CPU (50 epochs)
- **Model size:** < 50 KB
- **Browser inference:** < 5 ms per prediction

---

## Integration with Browser

The model is automatically ready to use. In your browser code:

```javascript
import { loadModel } from './js/emotion-detector.js';

// Load the trained model
await loadModel('../model/model.json');

// Model is now ready! audio-features.js → emotion-detector.js will work automatically
```

---

## Files Reference

| Script                  | Purpose                                |
|-------------------------|----------------------------------------|
| `extract_features.py`   | RAVDESS audio → CSV + normalization    |
| `train_model.py`        | Train MLP, save .h5 model              |
| `export_tfjs.py`        | Convert to TensorFlow.js format        |
| `requirements.txt`      | Python dependencies                    |
| `README.md`             | Full documentation (you are here!)     |
| `QUICKSTART.md`         | This file — the express guide          |

---

## Troubleshooting

**"No .wav files found"**  
→ Make sure the RAVDESS path contains `Actor_01/`, `Actor_02/`, etc.

**"tensorflowjs_converter not found"**  
→ Run `pip install tensorflowjs`

**"Accuracy below 50%"**  
→ Check you're using the full RAVDESS dataset (1440 files, not a subset)  
→ Try increasing epochs: `--epochs 100`

**Model won't load in browser**  
→ Ensure files are served via HTTP (not `file://`)  
→ Check browser console for CORS or loading errors

---

## Next Steps

1. ✅ Training pipeline complete — you can train the model now
2. ⏳ **Waiting on:** RAVDESS dataset download
3. 🔜 **After training:** Integrate model with Leia's app.js and test with live microphone input
4. 🔜 **Future:** Collect real user data to fine-tune on spontaneous speech (not acted)

---

For detailed documentation, see `README.md` in this directory.

For project context, see `.squad/agents/chewie/history.md`.
