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

### Phase 1 Complete — Browser Modules Delivered

- **Scaffolding created:** `src/index.html` (shell), `src/js/`, `src/css/`
- **`src/js/mic-input.js`** — getUserMedia wrapper with AudioContext. Exposes `start()`, `stop()`, `getMediaStream()`, `getSourceNode()`, `getAudioContext()`, `onStreamReady()`, `onError()`. Handles permission denial, missing mic, and busy mic with user-friendly messages. Fully releases mic on `stop()`.
- **`src/js/speech-to-text.js`** — SpeechRecognition wrapper. Continuous mode with auto-restart on browser `end` events. Interim + final result callbacks. `submitText()` fallback for browsers without Web Speech API. Language: en-US.
- **`src/js/text-to-speech.js`** — SpeechSynthesis wrapper. Emotion-adjusted pitch/rate presets (calm, stressed, happy, sad, neutral). Voice selection prefers natural-sounding English voices. Queue management cancels current speech before starting new. Chrome stuck-speech workaround included.
- **Pattern: default + named exports** — every module exports both `export default {...}` and individual named exports, so consumers can `import mic from './mic-input.js'` or `import { start, stop } from './mic-input.js'`.
- **Pattern: kid-friendly doc comments** — each module has a "How to explain it to a kid" section in its JSDoc header.
- **Added `getAudioContext()`** to mic-input.js beyond the spec — Chewie's `audio-features.js` will need the AudioContext to create AnalyserNodes. This is a forward-looking addition.
- **Key files:** `src/index.html`, `src/js/mic-input.js`, `src/js/speech-to-text.js`, `src/js/text-to-speech.js`

### Cross-Team Awareness: Chewie's Fallback Architecture (2026-04-04)

- Chewie delivered `emotion-fallback.js` — a rule-based emotion estimator that doesn't require a trained TensorFlow.js model
- This allows Phase 1 end-to-end operation: mic → STT → audio-features → fallback emotions → TTS
- The fallback will be automatically used by `emotion-detector.js` if the ML model can't load
- Implication for Phase 2 `app.js` wiring: No changes needed — `emotion-detector.js` handles the swap automatically
- Feature order is locked: [pitch, pitchVar, energy, centroid, zcr, speechRate] — ensure Chewie's features match this order
