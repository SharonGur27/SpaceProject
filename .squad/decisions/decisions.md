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

---

## Decision: Phase 2 Integration Layer Architecture

**Author:** Leia (Frontend Dev)  
**Date:** 2026-04-07  
**Status:** Implemented  

### Context

Phase 2 required building the integration layer that wires all Phase 1 modules (mic-input, speech-to-text, text-to-speech, audio-features, emotion-detector) into a working end-to-end application.

### Decisions Made

#### 1. AnalyserNode Connection Pattern

**Decision:** app.js creates the AnalyserNode and connects: `sourceNode → analyser` (NOT to destination)

**Rationale:** 
- Prevents audio feedback loop
- Gives audio-features.js the analyser it needs for feature extraction
- Keeps mic-input.js generic (doesn't need to know about feature extraction)

#### 2. Confidence Thresholds in Brain

**Decision:** Three-tier confidence system in dekel-brain.js:
- High: ≥0.65 → detailed, emotion-specific response
- Medium: ≥0.45 → shorter, emotion-aware response
- Low: <0.45 → gentle check-in, no assumption

**Rationale:**
- Matches Chewie's emotion-detector thresholds (0.55 confident, 0.40 uncertain)
- Prevents Dekel from making wrong assumptions about user's state
- Gentle check-ins feel more supportive than guessing

#### 3. Status State Machine

**Decision:** Four states: ready → listening → processing → speaking → ready

**Rationale:**
- Clear visual feedback for each step
- Button disabled during processing/speaking prevents confusion
- Color coding (green/blue/orange/purple) provides instant recognition

#### 4. Button UX: Toggle Mode

**Decision:** Single button toggles between "Talk" and "Stop" modes

**Rationale:**
- Simpler than separate start/stop buttons
- Visual feedback (text change + animation) confirms state
- Matches natural conversation pattern

#### 5. TTS Emotion Preset

**Decision:** Dekel always responds with "calm" emotion voice preset

**Rationale:**
- Supportive response should help regulate user's emotion
- Matching user's stressed voice with stressed response could amplify anxiety
- Calm, steady voice feels more like a therapist/companion

#### 6. Fallback Text Input

**Decision:** Include text input field below talk button

**Rationale:**
- Web Speech API only available in Chrome/Edge
- Allows testing on other browsers
- Accessibility: some users prefer typing
- Follows progressive enhancement principle

### Impact

- `src/js/dekel-brain.js` — Response generator (275 LOC)
- `src/js/ui.js` — UI controller (420 LOC)
- `src/js/app.js` — Main orchestrator (385 LOC)
- `src/index.html` — Full UI markup (updated)
- `src/css/styles.css` — Space-themed styling (420 LOC)

### Team Awareness

Feature/label/threshold ordering enforced:
- Feature order: [pitch, pitchVar, energy, centroid, zcr, speechRate]
- Emotion labels: calm, stressed, happy, sad, neutral
- Confidence thresholds: 0.65 (high), 0.45 (medium), 0.55 (model trigger)

---

## Decision: Training Pipeline — Feature Extraction & Model Architecture

**Decision Date:** 2026-04-07  
**Decided By:** Chewie (ML/Audio Engineer)  
**Status:** Implemented  
**Impact:** Phase 2 (training pipeline)

### Context

Phase 2 required a Python training pipeline to:
1. Extract audio features from RAVDESS dataset
2. Train an emotion classification model
3. Export to TensorFlow.js format for browser deployment

### Decisions Made

#### 1. Pitch Detection: librosa.pyin (not autocorrelation)

**Choice:** Use `librosa.pyin()` for pitch extraction in Python  
**Rationale:**
- Browser uses autocorrelation (no librosa available in JS)
- BUT: librosa.pyin is more robust to noise and better handles acted speech in RAVDESS
- Training on cleaner pitch estimates → model learns prosody patterns more accurately
- The browser's autocorrelation will be "close enough" (both detect F0 in 80-400 Hz range)
- Slight train/test mismatch is acceptable — normalization stats bridge the gap

#### 2. Speech Rate Proxy: Tempo-Based Onset Detection

**Choice:** Use `librosa.beat.beat_track()` on onset envelope (energy peaks)  
**Rationale:**
- Browser uses simple energy-envelope peak counting
- librosa's tempo estimation is more sophisticated
- Both measure energy peaks per second → conceptually similar
- librosa's method is more reliable for short clips (~3s RAVDESS files)

#### 3. Emotion Mapping: RAVDESS 8 → Our 5 Classes

**Mapping:**
```
RAVDESS 01 (neutral)   → neutral
RAVDESS 02 (calm)      → calm
RAVDESS 03 (happy)     → happy
RAVDESS 04 (sad)       → sad
RAVDESS 05 (angry)     → stressed
RAVDESS 06 (fearful)   → stressed
RAVDESS 07 (disgust)   → stressed
RAVDESS 08 (surprised) → happy
```

**Rationale:**
- Consolidates negative high-arousal emotions (angry/fearful/disgust) → "stressed"
- Surprised → happy (both high-arousal positive)
- Results in ~288 samples per class (balanced)
- Reduces model complexity (5 output neurons vs. 8)

#### 4. Model Architecture: Small MLP (6→32→16→5)

**Architecture:**
```
Input(6) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)
```

**Rationale:**
- 6 inputs: Matches browser feature extraction exactly
- 32 hidden units (layer 1): 5× input dimension — captures feature interactions
- 16 hidden units (layer 2): Gradual compression toward output
- 5 outputs: One per emotion class, softmax for probability distribution
- ReLU activation: Standard for hidden layers, prevents vanishing gradients
- Total params: ~1200 → <50 KB model (browser-friendly)
- Performance target: ≥50% validation accuracy (5-class baseline = 20%)

#### 5. Feature Order Enforcement

**Critical constraint:** Feature order MUST match audio-features.js

**Enforced order:** `[meanPitch, pitchVariance, energy, spectralCentroid, zeroCrossingRate, speechRate]`

**Why critical:** Mismatched order → model sees garbage input at inference time

#### 6. Label Order Enforcement

**Critical constraint:** Emotion labels MUST match emotion-detector.js EMOTION_LABELS

**Enforced order:** `['calm', 'stressed', 'happy', 'sad', 'neutral']`

**Why critical:** Model output index must correspond to correct emotion label

### Impact

- `training/extract_features.py` — Feature extraction from RAVDESS
- `training/train_model.py` — MLP training
- `training/export_tfjs.py` — TensorFlow.js export
- `training/requirements.txt` — Python dependencies
- `training/README.md` — Complete usage guide
- Model output: `src/model/model.json` + shards + `normalization.json`

### Consequences

**Positive:**
- ✅ Training pipeline produces browser-compatible model
- ✅ Feature extraction well-documented
- ✅ Small model size (<50 KB) enables fast browser loading
- ✅ Clear separation: Python for training, JS for inference

**Negative:**
- ⚠️ Slight train/test feature mismatch (pyin vs. autocorrelation for pitch)
  - Mitigated by: z-score normalization, confidence thresholds
- ⚠️ RAVDESS is acted speech → real-world spontaneous speech may differ
  - Mitigated by: Fallback classifier (emotion-fallback.js) for low-confidence predictions

**Neutral:**
- 📊 Expected accuracy: 50-65% (5-class) — acceptable for prototype
