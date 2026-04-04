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

- **Your Phase 1 tasks (parallel with Leia & Chewie):**
  - Test harness setup (`tests/test-harness.js`)
  - Unit test stubs for all 8 modules (specs in `docs/tasks.md`)
- **Phase 2 tasks (sequential, depends on Phase 1):**
  - Write unit tests as Leia/Chewie complete their modules
  - Test coverage for mic, STT, TTS, audio features, emotion detection
- **Phase 3 tasks (final integration phase):**
  - Integration tests (end-to-end audio → emotion → response)
  - Edge case testing (permission denial, network loss, etc.)
- **Architecture:** Full docs in `docs/architecture.md`, task details in `docs/tasks.md`
- **Testing approach:** Jest or Karma (choose based on team preference)
- **Status:** Decision documented in `.squad/decisions/decisions.md`, awaiting team review

### 2026-04-05 — Test Infrastructure & Stubs Complete (Phase 1)

- **Framework chosen:** Vitest (v4.1.2) — lightweight, ESM-native, fast (<600ms full run)
- **Test scripts:** `npm test` (vitest run), `npm run test:watch` (vitest)
- **Test files created (5 files, 110 test cases total):**
  - `tests/mic-input.test.js` — 18 tests (2 real, 16 todo) — getUserMedia mocks, permission denial, stop-before-start safety
  - `tests/speech-to-text.test.js` — 21 tests (3 real, 18 todo) — SpeechRecognition/webkitSpeechRecognition mocks, isSupported logic
  - `tests/text-to-speech.test.js` — 23 tests (6 real, 17 todo) — SpeechSynthesisUtterance mocks, emotion parameter validation tables
  - `tests/audio-features.test.js` — 24 tests (7 real, 17 todo) — sine wave generator, RMS calculation, zero crossing count, AnalyserNode mocks
  - `tests/emotion-detector.test.js` — 24 tests (7 real, 17 todo) — TF.js mock, confidence threshold tests, softmax sum validation
- **Mock strategies:**
  - `globalThis.navigator.mediaDevices.getUserMedia` for mic tests
  - `globalThis.SpeechRecognition` / `webkitSpeechRecognition` constructors
  - `globalThis.speechSynthesis` + custom `SpeechSynthesisUtterance` class
  - Mock AnalyserNode with `getFloatTimeDomainData` / `getFloatFrequencyData`
  - Mock TF.js `loadLayersModel` + model `.predict()` → `dataSync()`
- **Key edge cases identified:**
  - Stop before start (mic, STT) — must be no-op
  - getUserMedia undefined in old browsers
  - AudioContext suspended state (autoplay policy)
  - Empty speech results from browser
  - NaN/null features to emotion model
  - No voices available for TTS
- **Helper functions written:** `generateSineWave()`, `generateSilence()`, `generateConstant()` for audio test data
- **25 assertions pass now** (contract validations, math proofs, mock sanity); 85 todos ready for when modules land

### Cross-Team Awareness: Phase 1 Parallel Completion (2026-04-04)

- **Leia delivered:** mic-input.js, speech-to-text.js, text-to-speech.js + scaffolding. Added `getAudioContext()` beyond spec to support Chewie's AnalyserNode pattern.
- **Chewie delivered:** audio-features.js (6-feature extraction with autocorrelation pitch), emotion-detector.js, emotion-fallback.js (rule-based estimator for Phase 1 end-to-end)
- **Feature order locked:** [pitch, pitchVar, energy, centroid, zcr, speechRate] — model/extraction must match
- **Confidence thresholds:** 0.55 (model trigger), 0.40 (uncertain flag)
- **Test mocks ready:** AnalyserNode (getFloatTimeDomainData, getFloatFrequencyData), TF.js model loader, SpeechRecognition, AudioContext
- **25 real test assertions already passing** against the delivered modules

