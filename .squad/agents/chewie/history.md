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
