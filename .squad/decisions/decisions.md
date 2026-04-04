# Decisions

## Decision: Dekel Voice Subsystem Architecture

**Author:** Han  
**Date:** 2026-04-04  
**Status:** Proposed  
**Scope:** Full architecture for voice input, speech output, emotion detection  

### Summary

Designed the complete Dekel voice subsystem architecture. Key choices:

1. **Web Speech API** for STT and TTS — built-in, free, no API keys
2. **TensorFlow.js** with a small MLP (Input(6) → Dense(32) → Dense(16) → Dense(5)) for emotion detection
3. **6 prosody features** extracted via Web Audio API's AnalyserNode: pitch, pitch variance, energy, spectral centroid, zero crossing rate, speech rate
4. **5-emotion set:** calm, stressed, happy, sad, neutral
5. **Rule-based response logic** in dekel-brain.js (not LLM)
6. **RAVDESS dataset** for offline model training, exported to TF.js format
7. **Confidence threshold at 0.55** — fallback to neutral with verbal check-in when uncertain

### Artifacts

- `docs/architecture.md` — full technical blueprint
- `docs/tasks.md` — task allocation for Leia, Chewie, Lando

### Trade-offs

- Web Speech API STT needs internet (acceptable per PRD)
- MLP on features is less accurate than CNN on spectrograms, but simpler and faster
- 5 emotions is less nuanced than 7+, but more separable by prosody features
- RAVDESS is acted speech — real accuracy may differ

### Requires Review From

- Team consensus before implementation begins

---

## Decision: Rule-based emotion fallback for Phase 1

**Author:** Chewie (ML/Audio Engineer)  
**Date:** 2026-04-04  
**Status:** Implemented  

### Context

The TensorFlow.js emotion model requires training on RAVDESS data (Phase 2). The app needs to run end-to-end before that model exists.

### Decision

Created `src/js/emotion-fallback.js` — a deterministic, rule-based emotion estimator that reads the same 6-feature z-score vector the ML model will consume. It uses weighted sums matching known prosody–emotion correlations (Scherer 2003) and softmax normalisation to produce probability-like outputs.

`emotion-detector.js` automatically falls back to this module when TF.js or the model file isn't available.

### Trade-offs

- **Pro:** App works end-to-end in Phase 1. Same interface contract as the ML model — no wiring changes needed.
- **Con:** Can't differentiate stressed from happy well (both are high-arousal). ML model will do better.
- **Mitigated:** Confidence thresholds flag ambiguous cases as `uncertain: true`. Dekel Brain will ask gentle check-in questions instead of assuming.

### Impact

- Leia can integrate without waiting for the trained model.
- Lando can write tests against the fallback (no TF.js mock needed).
- Phase 2 swap-in is a single `loadModel()` call — no API changes.

---

## Decision: Vitest as Test Framework

**By:** Lando (Tester)  
**Date:** 2026-04-05  
**Status:** Implemented  

### Context

Task allocation mentioned Jest or Karma as options for testing. Needed a framework that works well with ES module browser code, runs fast, and doesn't require heavy configuration.

### Decision

Chose **Vitest** over Jest/Karma because:
- ESM-native — no transform config needed for our ES module source files
- Built-in `vi.fn()` / `vi.mock()` mocking (same API as Jest, zero learning curve)
- Sub-second test runs (598ms for 110 tests)
- No browser runtime needed — all browser APIs are mocked at the `globalThis` level

### Impact

- `package.json` has `vitest` as devDependency
- Test scripts: `npm test` (single run), `npm run test:watch` (dev mode)
- All test files use `import { describe, it, expect, vi } from 'vitest'`
- When Leia/Chewie deliver modules, tests import from `../src/js/<module>.js`

---

## Decision: mic-input exposes getAudioContext()

**Author:** Leia  
**Date:** Phase 1 delivery  
**Status:** Implemented  

### Context

The `mic-input.js` interface contract in `docs/tasks.md` specifies `getSourceNode()` but not `getAudioContext()`. However, Chewie's `audio-features.js` will need the `AudioContext` instance to create an `AnalyserNode` and connect it to the source.

### Decision

Added `getAudioContext()` to `mic-input.js` as an extra export. This is additive — doesn't break any existing contract. Without it, Chewie would need to create a second AudioContext or we'd need to restructure the wiring.

### Impact

- Chewie can call `mic.getAudioContext().createAnalyser()` directly
- `app.js` wiring becomes simpler in Phase 2
- No breaking changes to existing interface
