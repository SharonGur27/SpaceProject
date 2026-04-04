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

- **Your Phase 1 tasks (parallel with Chewie & Lando):**
  - `src/js/mic-input.js` — microphone access, stream setup, permission handling
  - `src/js/speech-to-text.js` — Web Speech API STT integration
  - `src/js/text-to-speech.js` — Web Speech API TTS integration
- **Phase 2 tasks (sequential, depends on Phase 1):**
  - `src/js/ui.js` — UI components (wiring mic/speaker states, emotion display)
  - `src/js/dekel-brain.js` — rule-based response logic (emotion + text → reply)
  - `src/js/app.js` — orchestration, main event loop, module wiring
- **Architecture:** Full docs in `docs/architecture.md`, task details in `docs/tasks.md`
- **Critical handoff:** Chewie's `audio-features.js` output (Float32Array of 6 values) → your `app.js` → Chewie's `emotion-detector.js`
- **Status:** Decision documented in `.squad/decisions/decisions.md`, awaiting team review
