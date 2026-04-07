# Project Context

- **Owner:** Sharon Gur
- **Project:** Dekel — a supportive virtual psychologist for astronauts (educational prototype)
- **Stack:** Browser-based (Chrome/Edge), JavaScript, Web Audio API, Web Speech API, TensorFlow.js
- **Focus:** Voice input, speech output, emotion detection from voice prosody
- **Goal:** Working, understandable prototype — explainable to children
- **Created:** 2026-04-02

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-04 — Architecture Decided & Task Allocation

- **Your Phase 1 tasks (parallel with Leia & Lando):**
  - `src/js/audio-features.js` — 6-feature extraction (pitch, variance, energy, spectral centroid, ZCR, speech rate) from AudioContext
  - `src/js/emotion-detector.js` — TensorFlow.js model integration (6 features → 5 emotions)
  - `training/` — Python pipeline for RAVDESS dataset → TF.js model export
- **Phase 2 tasks (sequential, depends on Phase 1):**
  - Model training & export to `src/model/emotion-model.json`
  - Integrate trained model with `emotion-detector.js`
- **Architecture:** Full docs in `docs/architecture.md`, task details in `docs/tasks.md`
- **Critical handoff:** Your `audio-features.js` output (Float32Array of 6) → `emotion-detector.js` (you own both). Leia's `app.js` calls both.
- **Model details:** Small MLP (Input(6) → Dense(32) → Dense(16) → Dense(5 emotions)), confidence threshold 0.55
- **Status:** Decision documented in `.squad/decisions/decisions.md`, awaiting team review

### 2026-04-04 — Phase 1 Audio Modules Delivered

- **Files created:**
  - `src/js/audio-features.js` — Real-time 6-feature extraction (pitch, pitchVar, energy, spectralCentroid, ZCR, speechRate). Uses autocorrelation for pitch, AnalyserNode FFT for spectral centroid, energy-envelope peaks for speech rate proxy. Z-score normalised with predefined stats from `DEFAULT_NORM_STATS`. Emits features every 500 ms; skips silent frames (RMS < 0.01). Buffers ~2-3s of frames with 25% overlap for continuity.
  - `src/js/emotion-detector.js` — TF.js model loader with confidence thresholds (0.55 / 0.40). Gracefully degrades to fallback if model can't load. Imports `emotion-fallback.js` for rule-based mode.
  - `src/js/emotion-fallback.js` — Deterministic, threshold-based emotion estimation. Weighted feature sums per emotion, softmax normalised. Lets the app run end-to-end before ML model exists.
- **Key decisions:**
  - Autocorrelation pitch detection with MIN_CORRELATION = 0.5 — rejects noise frames, only accepts voiced speech.
  - `getFloatFrequencyData()` returns dB; we convert to linear magnitude (10^(dB/20)) for spectral centroid.
  - Fallback module uses temperature = 2.0 in softmax to avoid overly peaked distributions.
  - Feature order is fixed: [pitch, pitchVar, energy, centroid, zcr, speechRate] — model and extraction must match.
- **For Leia:** `init(analyserNode, audioContext)` then `startExtraction()`. Register `onFeaturesReady(cb)` to get Float32Array(6). Call `stopExtraction()` on stop.
- **For Lando:** `emotion-fallback.js` is testable standalone (no browser deps). `audio-features.js` needs a mock AnalyserNode.

### Cross-Team Awareness: Leia's getAudioContext() & Lando's Vitest (2026-04-04)

- Leia added `getAudioContext()` to mic-input.js — this unblocks your AnalyserNode creation pattern without needing a second AudioContext
- Lando chose **Vitest** as the test framework: ESM-native, sub-second runs (~600ms), Jest-compatible mocks
- Test files available: `tests/audio-features.test.js` with AnalyserNode mocks, `tests/emotion-detector.test.js` with TF.js mocks
- Your `audio-features.js` uses this exact mock: `getFloatTimeDomainData()`, `getFloatFrequencyData()` with dB-to-linear conversion
- Confidence thresholds decision: 0.55 for model trigger, 0.40 for uncertain flag (documented in decisions.md)

### 2026-04-07 — Phase 2: RAVDESS Training Pipeline Complete

- **Files created:**
  - `training/extract_features.py` — Feature extraction from RAVDESS audio files. Uses librosa.pyin for pitch (more robust than autocorrelation), RMS for energy, spectral_centroid, ZCR, tempo-based speech rate. Maps RAVDESS 8 emotions → our 5 classes (angry/fearful/disgust → stressed, surprised → happy). Outputs features.csv + normalization.json.
  - `training/train_model.py` — MLP training (Input(6) → Dense(32) → Dense(16) → Dense(5)). 80/20 train/val split, Adam optimizer, sparse_categorical_crossentropy loss. Target: ≥50% accuracy. Outputs emotion_model.h5 + training plots.
  - `training/export_tfjs.py` — Converts Keras model to TensorFlow.js format using tensorflowjs_converter. Copies normalization stats to src/model/ directory. Verifies model loads correctly.
  - `training/requirements.txt` — Python dependencies (librosa, tensorflow, tensorflowjs, sklearn, pandas, numpy, matplotlib/seaborn).
  - `training/README.md` — Complete usage instructions: dataset download, 3-step pipeline workflow, integration with browser code, troubleshooting.
  
- **Key technical decisions:**
  - **Pitch detection:** librosa.pyin (probabilistic YIN) preferred over autocorrelation — more robust to noise, better for acted speech
  - **Speech rate proxy:** librosa.beat.beat_track on onset envelope (energy peaks) → tempo in BPM → syllables/sec estimate
  - **Emotion mapping:** RAVDESS codes 01-08 → 5 classes. Consolidates negative high-arousal states (angry/fearful/disgust) into "stressed"
  - **Feature order enforced:** [meanPitch, pitchVariance, energy, spectralCentroid, zeroCrossingRate, speechRate] — MUST match audio-features.js
  - **Label order enforced:** ['calm', 'stressed', 'happy', 'sad', 'neutral'] via LabelEncoder.classes_ — MUST match emotion-detector.js EMOTION_LABELS
  - **Model size:** ~1200 parameters, <50 KB — browser-friendly, sub-5ms inference
  
- **Integration path:**
  1. Run extract_features.py on RAVDESS dataset → features.csv + normalization.json
  2. Run train_model.py on features.csv → emotion_model.h5 + training plots (expect ~50-65% val accuracy on RAVDESS)
  3. Run export_tfjs.py → src/model/model.json + weight shards + normalization.json
  4. Browser code loads model via emotion-detector.js loadModel('../model/model.json')
  5. Optionally update audio-features.js DEFAULT_NORM_STATS with trained normalization stats (or load dynamically via setNormalizationStats())
  
- **For Leia:** Model artifacts will live in `src/model/` after export. emotion-detector.js already has loadModel() API ready.
- **For Lando:** Training scripts include visualization (accuracy/loss curves, confusion matrix) if matplotlib available. Model verification step in export_tfjs.py.

### Cross-Team Integration: Phase 2 Complete (2026-04-07)

**Integration with Leia's Phase 2 deliverables:**
- Feature order verified: [pitch, pitchVar, energy, centroid, zcr, speechRate] ✓ (matches audio-features.js extraction)
- Emotion labels verified: calm, stressed, happy, sad, neutral ✓ (matches emotion-detector.js and dekel-brain.js)
- Confidence thresholds: 0.55 (model confident), 0.40 (uncertain flag) ✓ (integrated with dekel-brain.js three-tier system)
- Model input/output shapes: (batch, 6) → (batch, 5) ✓ (browser-compatible)
- AnalyserNode pipeline: app.js creates analyser from mic's AudioContext, connects sourceNode → analyser, passes to audio-features.init() ✓

**Integration with Lando's Phase 2 testing:**
- Extract_features.py and train_model.py fully testable with pytest
- Feature extraction mocks in tests/audio-features.test.js align with librosa output format
- Model output tensor structure documented for test mocking (tests/emotion-detector.test.js)
- Training visualization included for debugging (matplotlib plots in train_model.py)
