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
