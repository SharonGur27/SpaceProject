# Dekel — Task Allocation

> Based on the architecture defined in `docs/architecture.md`.
> All file paths relative to project root.

**Author:** Han (Lead/Architect)
**Date:** 2026-04-04
**Status:** Ready for team execution

---

## Execution Strategy

### Parallelism Map

```
Phase 1 (PARALLEL):
  Leia:   mic-input.js + speech-to-text.js + text-to-speech.js
  Chewie: audio-features.js + emotion-detector.js + training pipeline
  Lando:  Test harness setup + unit test stubs

Phase 2 (SEQUENTIAL — needs Phase 1):
  Leia:   ui.js + dekel-brain.js + app.js (integration wiring)
  Chewie: Model training + export + integration with emotion-detector.js
  Lando:  Unit tests (as modules land)

Phase 3 (SEQUENTIAL — needs Phase 2):
  Leia:   End-to-end integration, polish
  Lando:  Integration tests, edge case testing
  Han:    Code review, architecture validation
```

**Key dependency:** Chewie's `audio-features.js` must be done before Leia wires it into `app.js`. But Chewie and Leia can work in parallel in Phase 1 because their modules have clean interfaces.

---

## Leia — Frontend Dev

### Priority 1: Microphone Input Module ⬅️ START HERE

**File:** `src/js/mic-input.js`

**What to build:**
- A module that requests mic permission via `getUserMedia()`
- Creates an `AudioContext` and connects the mic stream as a `MediaStreamSource`
- Exposes the raw `MediaStream` (for STT) and the `AudioContext` source node (for feature extraction)
- Provides `start()`, `stop()`, and event callbacks (`onStreamReady`, `onError`)
- Handles permission denial gracefully (show user-friendly message)

**Interface contract:**
```js
// mic-input.js exports:
{
  start()           → Promise<void>
  stop()            → void
  getMediaStream()  → MediaStream      // for SpeechRecognition
  getSourceNode()   → MediaStreamAudioSourceNode  // for audio feature pipeline
  onStreamReady(cb) → void
  onError(cb)       → void
}
```

**Acceptance criteria:**
- [ ] Mic permission is requested and stream is captured
- [ ] Both MediaStream and AudioContext source are available
- [ ] Calling `stop()` releases the mic (no lingering red dot)
- [ ] Permission denial shows a clear error, doesn't crash
- [ ] Works in Chrome and Edge

**Dependencies:** None — can start immediately.

---

### Priority 2: Speech-to-Text Module

**File:** `src/js/speech-to-text.js`

**What to build:**
- Wrapper around `webkitSpeechRecognition` / `SpeechRecognition`
- Continuous mode with auto-restart
- Emits interim results and final results as events
- Fallback: if SpeechRecognition is unavailable, expose a method to accept typed text input

**Interface contract:**
```js
// speech-to-text.js exports:
{
  start(mediaStream?)  → void
  stop()               → void
  onInterimResult(cb)  → void   // cb(text: string)
  onFinalResult(cb)    → void   // cb(text: string)
  onError(cb)          → void   // cb(error: Error)
  isSupported()        → boolean
}
```

**Acceptance criteria:**
- [ ] Real-time transcription of speech to text
- [ ] Interim results update as user speaks
- [ ] Final results fire when user pauses
- [ ] Auto-restarts after pause (continuous listening)
- [ ] Fallback text input works if API unavailable
- [ ] Language set to `en-US`

**Dependencies:** `mic-input.js` (needs MediaStream), but can be developed against a mock stream.

---

### Priority 3: Text-to-Speech Module

**File:** `src/js/text-to-speech.js`

**What to build:**
- Wrapper around `SpeechSynthesis`
- Accept text + optional emotion context to adjust voice parameters
- Voice selection logic (prefer natural-sounding voices)
- Queue management (don't overlap speech)

**Interface contract:**
```js
// text-to-speech.js exports:
{
  speak(text, options?)  → Promise<void>   // options: { pitch, rate, emotion }
  stop()                 → void
  isSpeaking()           → boolean
  onStart(cb)            → void
  onEnd(cb)              → void
}
```

**Emotion-adjusted parameters:**
| Emotion | Pitch | Rate |
|---------|-------|------|
| calm    | 1.0   | 0.9  |
| stressed (responding to) | 0.9 | 0.85 |
| happy   | 1.1   | 1.0  |
| sad     | 0.9   | 0.85 |
| neutral | 1.0   | 0.95 |

**Acceptance criteria:**
- [ ] Dekel speaks text aloud clearly
- [ ] Voice parameters adjust based on detected emotion
- [ ] `stop()` interrupts current speech
- [ ] Doesn't overlap with mic input (mute mic during TTS or handle echo)
- [ ] Works with at least one voice in Chrome and Edge

**Dependencies:** None — can start immediately (parallel with Priority 1).

---

### Priority 4: Dekel Brain (Response Logic)

**File:** `src/js/dekel-brain.js`

**What to build:**
- Rule-based response generator
- Takes `{ text, emotion, confidence }` and returns a response string
- Response templates for each emotion
- Handles uncertain confidence gracefully

**Interface contract:**
```js
// dekel-brain.js exports:
{
  generateResponse({ text, emotion, confidence }) → { reply: string, emotion: string }
}
```

**Response examples:**
| Emotion | Confidence | Example response |
|---------|-----------|-----------------|
| stressed | high | "I hear some tension in your voice. Take a slow breath with me. What's on your mind?" |
| happy | high | "You sound great! Tell me more about what's making you happy." |
| calm | high | "You seem relaxed. That's wonderful. What are you thinking about?" |
| sad | high | "I notice your voice is a bit low. I'm here to listen. What's going on?" |
| any | low | "I want to make sure I understand. How are you feeling right now?" |

**Acceptance criteria:**
- [ ] Returns appropriate response for each emotion
- [ ] Low-confidence responses are gentle check-ins, not assumptions
- [ ] Responses feel supportive and appropriate for astronauts
- [ ] No response is longer than 2-3 sentences (Dekel shouldn't lecture)

**Dependencies:** None for logic, but needs emotion-detector output format defined (see Chewie).

---

### Priority 5: UI Controller + HTML/CSS

**Files:** `src/js/ui.js`, `src/index.html`, `src/css/styles.css`

**What to build:**
- Main page with:
  - "Talk to Dekel" button (push-to-talk or toggle)
  - Transcript area (what user said)
  - Emotion indicator (icon or colored badge: 😌 calm, 😰 stressed, 😊 happy, 😔 sad, ❓ uncertain)
  - Dekel's response area (what Dekel says back)
  - Status indicator (listening / processing / speaking)
- Space-themed styling (dark background, stars, gentle colors)
- Accessible and simple layout

**Acceptance criteria:**
- [ ] User can start/stop listening with a button
- [ ] Transcript updates in real-time as user speaks
- [ ] Emotion badge shows detected emotion with confidence
- [ ] Dekel's response appears as text and is spoken aloud
- [ ] Status transitions are visible (listening → processing → speaking → ready)
- [ ] Layout is clean and would make sense to a child

**Dependencies:** All JS modules (this wires them together).

---

### Priority 6: App Controller (Integration)

**File:** `src/js/app.js`

**What to build:**
- Import all modules and wire the event flow
- Handle the full conversation cycle:
  1. Button press → start mic + STT + feature extraction
  2. User speaks → transcript updates + features accumulate
  3. User stops → send text + emotion to brain
  4. Brain replies → TTS speaks + UI updates
  5. Ready for next input
- Error handling at each step

**Acceptance criteria:**
- [ ] Full conversation cycle works end-to-end
- [ ] Errors in one module don't crash the whole app
- [ ] Console logs show the flow for debugging

**Dependencies:** All other modules must be functional.

---

## Chewie — ML/Audio Engineer

### Priority 1: Audio Feature Extraction ⬅️ START HERE

**File:** `src/js/audio-features.js`

**What to build:**
- A module that takes an `AnalyserNode` (from mic-input) and extracts prosody features in real-time
- Extract these 6 features per analysis window (2-3 seconds):
  1. **Mean Pitch (F0)** — via autocorrelation on time-domain data
  2. **Pitch Variance** — std deviation of pitch samples in the window
  3. **Energy (RMS)** — root mean square of time-domain samples
  4. **Spectral Centroid** — weighted mean of FFT frequency bins
  5. **Zero Crossing Rate** — sign changes in time-domain data
  6. **Speech Rate Proxy** — energy envelope peak counting

- Normalize features (z-score or min-max with predefined stats)
- Output a `Float32Array` of length 6

**Interface contract:**
```js
// audio-features.js exports:
{
  init(analyserNode, audioContext) → void
  startExtraction()               → void
  stopExtraction()                → void
  onFeaturesReady(cb)             → void  // cb(features: Float32Array)
  getLatestFeatures()             → Float32Array | null
}
```

**Technical details:**
- `AnalyserNode.fftSize` = 2048 (gives 1024 frequency bins)
- Sample rate is typically 44100 Hz or 48000 Hz
- Use `getFloatTimeDomainData()` for pitch and energy
- Use `getFloatFrequencyData()` for spectral centroid
- Buffer ~2-3 seconds of frames, emit features every ~500ms

**Pitch detection via autocorrelation:**
```
For each frame:
  1. Get time-domain data from AnalyserNode
  2. Compute autocorrelation function
  3. Find the first peak after the initial decline
  4. F0 = sampleRate / peakLag
  5. Validate: if peak correlation < 0.5, discard (likely not voiced speech)
```

**Acceptance criteria:**
- [ ] Features extracted in real-time from microphone audio
- [ ] Pitch detection works for typical human voice range (80-400 Hz)
- [ ] Features are normalized consistently
- [ ] Silent periods are detected (energy below threshold → skip)
- [ ] No audible glitches or performance issues
- [ ] Output format matches what emotion-detector.js expects

**Dependencies:** Needs the `AnalyserNode` interface from `mic-input.js`, but can develop against a mock AnalyserNode using pre-recorded audio.

---

### Priority 2: Emotion Detector Module

**File:** `src/js/emotion-detector.js`

**What to build:**
- Load a pre-trained TensorFlow.js model
- Accept a feature vector (Float32Array of 6 features) and return emotion + confidence
- Implement confidence thresholds and fallback logic

**Interface contract:**
```js
// emotion-detector.js exports:
{
  loadModel(modelUrl?)    → Promise<void>
  predict(features)       → { emotion: string, confidence: number, allScores: Object }
  isModelLoaded()         → boolean
  getEmotionLabels()      → string[]   // ['calm', 'stressed', 'happy', 'sad', 'neutral']
}
```

**Confidence logic:**
```js
const scores = model.predict(tensor).dataSync();  // [0.1, 0.6, 0.15, 0.05, 0.1]
const maxIdx = argmax(scores);
const confidence = scores[maxIdx];

if (confidence >= 0.55) return { emotion: labels[maxIdx], confidence };
if (confidence >= 0.40) return { emotion: labels[maxIdx], confidence, uncertain: true };
return { emotion: 'neutral', confidence, uncertain: true };
```

**Acceptance criteria:**
- [ ] Model loads from `src/model/` directory
- [ ] Prediction returns emotion, confidence, and all class scores
- [ ] Confidence thresholds match architecture spec (0.55 / 0.40)
- [ ] Falls back to neutral when uncertain
- [ ] Prediction latency < 50ms (should be instant for a small MLP)
- [ ] Graceful error if model fails to load (return neutral for everything)

**Dependencies:** Needs the model files (from Priority 3). Can develop the loading/prediction code using a randomly initialized model first.

---

### Priority 3: Model Training Pipeline

**Files:** `training/extract_features.py`, `training/train_model.py`, `training/export_tfjs.py`

**What to build:**
- Python scripts to train the emotion model offline
- Feature extraction from RAVDESS dataset
- MLP training (matching the architecture in docs/architecture.md)
- Export to TensorFlow.js format

**Steps:**
1. **extract_features.py:**
   - Load RAVDESS audio files (WAV format)
   - Use `librosa` to extract: pitch, pitch variance, RMS energy, spectral centroid, ZCR, tempo
   - Map RAVDESS emotion codes to our 5 categories:
     - RAVDESS 01 (neutral) → neutral
     - RAVDESS 02 (calm) → calm
     - RAVDESS 03 (happy) → happy
     - RAVDESS 04 (sad) → sad
     - RAVDESS 05 (angry) → stressed
     - RAVDESS 06 (fearful) → stressed
     - RAVDESS 07 (disgust) → stressed
     - RAVDESS 08 (surprised) → happy
   - Save features + labels as CSV or NumPy arrays
   - Save normalization stats (mean, std per feature) — needed in browser

2. **train_model.py:**
   - Load extracted features
   - Build MLP: Input(6) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)
   - Train with 80/20 split, categorical crossentropy, Adam optimizer
   - Report accuracy, confusion matrix
   - Save Keras model

3. **export_tfjs.py:**
   - Convert saved Keras model to TF.js format using `tensorflowjs_converter`
   - Output `model.json` + weight shards to `src/model/`
   - Also export normalization stats as JSON to `src/model/normalization.json`

**Acceptance criteria:**
- [ ] Feature extraction runs on RAVDESS dataset without errors
- [ ] Model achieves ≥ 50% validation accuracy (5-class, so well above 20% random)
- [ ] Exported model loads in TensorFlow.js
- [ ] Normalization stats are exported and match what `audio-features.js` uses
- [ ] Scripts are documented with clear usage instructions

**Dependencies:** RAVDESS dataset download (Chewie manages this). No dependency on browser code.

---

### Priority 4: Integration Support

- Help Leia connect `audio-features.js` output to `emotion-detector.js` input
- Verify feature normalization works correctly end-to-end
- Tune confidence thresholds based on real browser testing

---

## Lando — Tester

### Priority 1: Test Harness Setup ⬅️ START HERE

**What to build:**
- Decide on test framework (recommendation: **Vitest** or plain **Jest** — keep it simple)
- Set up `package.json` with test scripts
- Create test directory structure matching `tests/` in architecture

**Acceptance criteria:**
- [ ] `npm test` runs and shows results
- [ ] Test framework is configured and a sample test passes
- [ ] Test structure mirrors the source module structure

**Dependencies:** None — can start immediately.

---

### Priority 2: Unit Tests (as modules land)

Write tests for each module as Leia and Chewie deliver them:

**File:** `tests/mic-input.test.js`
- Mock `getUserMedia` to simulate mic stream
- Test start/stop lifecycle
- Test permission denial error handling
- Test that both MediaStream and SourceNode are accessible

**File:** `tests/speech-to-text.test.js`
- Mock `SpeechRecognition`
- Test interim and final result events
- Test auto-restart behavior
- Test fallback when API unavailable

**File:** `tests/text-to-speech.test.js`
- Mock `SpeechSynthesis`
- Test speak/stop functions
- Test emotion-adjusted parameters (pitch/rate changes)
- Test queue management

**File:** `tests/audio-features.test.js`
- Test with known audio data (e.g., a pure sine wave → known pitch)
- Test energy calculation accuracy
- Test silence detection
- Test normalization

**File:** `tests/emotion-detector.test.js`
- Test model loading (mock TF.js)
- Test prediction with known feature vectors
- Test confidence thresholds:
  - High confidence → returns top emotion
  - Medium confidence → returns with uncertain flag
  - Low confidence → falls back to neutral
- Test graceful failure when model is missing

**File:** `tests/dekel-brain.test.js`
- Test response for each emotion at high confidence
- Test response for low confidence (gentle check-in)
- Test that responses are non-empty and reasonable length

**Acceptance criteria per test file:**
- [ ] All happy path scenarios covered
- [ ] Error/fallback scenarios covered
- [ ] Tests run in < 5 seconds total
- [ ] Tests don't require real mic/browser APIs (all mocked)

**Dependencies:** Each test file depends on its corresponding module being built.

---

### Priority 3: Edge Case & Fallback Tests

**File:** `tests/integration.test.js`

Test the full pipeline with mocked components:

- **Scenario: Normal conversation** — user speaks → text + emotion detected → Dekel responds
- **Scenario: Mic permission denied** — graceful error shown
- **Scenario: STT unavailable** — fallback to text input
- **Scenario: Model fails to load** — emotion defaults to neutral, system still works
- **Scenario: Silence** — no crash, no false emotion detection
- **Scenario: Very short utterance** (< 1 second) — handled gracefully
- **Scenario: Very long utterance** (> 30 seconds) — features accumulated correctly

**Edge cases to specifically validate:**
- [ ] What happens when `speechSynthesis.speak()` is called while mic is active? (echo?)
- [ ] What happens if the user clicks "Talk" twice rapidly?
- [ ] What happens if `AudioContext` is in suspended state? (need user gesture to resume)
- [ ] What happens on a page that's been in a background tab? (AudioContext may suspend)

**Acceptance criteria:**
- [ ] All edge cases documented and tested
- [ ] Fallback behavior works as specified in architecture
- [ ] No unhandled promise rejections in any scenario

**Dependencies:** All modules and unit tests complete.

---

## Summary: Execution Timeline

```
WEEK 1 — Foundation (PARALLEL)
├─ Leia:   mic-input.js, speech-to-text.js, text-to-speech.js
├─ Chewie: audio-features.js, emotion-detector.js (with mock model)
├─ Lando:  Test harness, test stubs
└─ Han:    Available for reviews, unblocking

WEEK 2 — Integration + Training
├─ Leia:   dekel-brain.js, ui.js, app.js wiring
├─ Chewie: Training pipeline, model export, integration support
├─ Lando:  Unit tests for all modules
└─ Han:    Code review, architecture validation

WEEK 3 — Polish + Testing
├─ Leia:   Bug fixes, UI polish
├─ Chewie: Model tuning, threshold adjustment
├─ Lando:  Integration tests, edge case testing
└─ Han:    Final review, sign-off
```

---

## Interface Contracts Summary

This table shows who produces what and who consumes it:

| Module | Producer | Consumer | Data exchanged |
|--------|----------|----------|----------------|
| mic-input.js | Leia | speech-to-text.js (Leia), audio-features.js (Chewie) | MediaStream, AudioSourceNode |
| speech-to-text.js | Leia | dekel-brain.js (Leia) | `string` (transcribed text) |
| audio-features.js | Chewie | emotion-detector.js (Chewie) | `Float32Array` (6 features) |
| emotion-detector.js | Chewie | dekel-brain.js (Leia) | `{ emotion, confidence }` |
| dekel-brain.js | Leia | text-to-speech.js (Leia) | `{ reply, emotion }` |
| text-to-speech.js | Leia | speaker | Audio output |
| model files | Chewie (training) | emotion-detector.js (Chewie) | `model.json` + weights |

**Critical handoff:** Chewie's `audio-features.js` and `emotion-detector.js` must match on feature format (Float32Array of 6 normalized values). Chewie owns both sides of this, so no cross-team risk.

**Cross-team handoff:** Leia's `app.js` consumes Chewie's modules. They need to agree on the interface contracts above. Han reviews this integration.
