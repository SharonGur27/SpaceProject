# Dekel — Architecture Design

> Voice input, speech output, and emotion detection from voice prosody.
> Designed to be explainable to children.

**Author:** Han (Lead/Architect)
**Date:** 2026-04-04
**Status:** Draft — pending team review

---

## 1. Architecture Overview

Dekel listens through the microphone, figures out what you said AND how you feel, then talks back to you. Think of it like a friend who listens to your voice and notices when you sound stressed, happy, or calm.

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│                                                             │
│  ┌──────────┐                                               │
│  │   MIC    │──► getUserMedia()                             │
│  └──────────┘        │                                      │
│                      ▼                                      │
│              ┌───────────────┐                               │
│              │  Audio Stream │                               │
│              └───────┬───────┘                               │
│                      │                                      │
│           ┌──────────┴──────────┐                            │
│           ▼                     ▼                            │
│  ┌─────────────────┐  ┌──────────────────┐                  │
│  │  Speech-to-Text │  │ Audio Features   │                  │
│  │  (Web Speech    │  │ (Web Audio API   │                  │
│  │   API)          │  │  AnalyserNode)   │                  │
│  └────────┬────────┘  └────────┬─────────┘                  │
│           │                    │                            │
│           │                    ▼                            │
│           │           ┌──────────────────┐                  │
│           │           │ Emotion Detector │                  │
│           │           │ (TensorFlow.js)  │                  │
│           │           └────────┬─────────┘                  │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────┐                    │
│  │          Dekel Brain                │                    │
│  │  (combines text + emotion → reply)  │                    │
│  └──────────────────┬──────────────────┘                    │
│                     │                                       │
│                     ▼                                       │
│            ┌─────────────────┐                              │
│            │  Text-to-Speech │                              │
│            │  (Web Speech    │                              │
│            │   Synthesis)    │                              │
│            └─────────────────┘                              │
│                     │                                       │
│                     ▼                                       │
│               🔊 Speaker                                    │
└─────────────────────────────────────────────────────────────┘
```

### How to explain it to a kid:

> "Dekel has two ears. One ear listens to your *words*. The other ear listens to your *feelings* — how fast you talk, how high your voice goes, how loud you are. Then Dekel's brain puts it all together and talks back to you."

---

## 2. Key Technologies & Justifications

### 2.1 Microphone Input — `navigator.mediaDevices.getUserMedia()`

| Aspect | Detail |
|--------|--------|
| **API** | `getUserMedia()` from the MediaDevices API |
| **Why** | The standard browser API for microphone access. Works in Chrome & Edge. No library needed. |
| **Alternatives rejected** | Third-party audio libraries (RecordRTC, etc.) — unnecessary weight for what we need. We just need a raw audio stream. |

### 2.2 Speech-to-Text — Web Speech API (`SpeechRecognition`)

| Aspect | Detail |
|--------|--------|
| **API** | `webkitSpeechRecognition` / `SpeechRecognition` |
| **Why** | Built into Chrome/Edge. Free. No API keys. Works in real-time. Good enough for a prototype. |
| **Alternatives rejected** | **Whisper.js** — excellent accuracy but heavy (~40MB model), adds complexity. **Google Cloud STT** — requires API key and server. **Vosk** — needs WASM setup. All overkill for a prototype where built-in works. |
| **Caveat** | Requires internet (Chrome sends audio to Google servers). This is acceptable per PRD. |

### 2.3 Audio Feature Extraction — Web Audio API (`AudioContext` + `AnalyserNode`)

| Aspect | Detail |
|--------|--------|
| **API** | `AudioContext`, `AnalyserNode`, `ScriptProcessorNode` / `AudioWorkletNode` |
| **Why** | Native browser API for real-time audio analysis. Gives us frequency data (FFT) and time-domain data — exactly what we need for emotion features. |
| **Alternatives rejected** | **Meyda.js** — good audio feature library but adds a dependency. We can extract the features we need directly from AnalyserNode. If feature extraction gets complex, we can add Meyda later. |

**Decision:** Start without Meyda. If Chewie finds AnalyserNode insufficient for MFCC extraction, upgrade to Meyda. This is the simplest thing that could work.

### 2.4 Emotion Detection — TensorFlow.js with a small custom model

| Aspect | Detail |
|--------|--------|
| **Library** | `@tensorflow/tfjs` |
| **Why** | Runs entirely in-browser. Well-documented. Can load pre-trained models. The standard choice for browser ML. |
| **Alternatives rejected** | **Teachable Machine** — easier to train but limited. We can't customize the audio feature pipeline (it expects raw audio spectrograms). **ONNX Runtime Web** — viable but less ecosystem support for beginners. **Hume AI / Affectiva** — cloud APIs, adds cost and privacy concerns. |

### 2.5 Text-to-Speech — Web Speech API (`SpeechSynthesis`)

| Aspect | Detail |
|--------|--------|
| **API** | `window.speechSynthesis` + `SpeechSynthesisUtterance` |
| **Why** | Built into every modern browser. Free. No setup. We can control pitch, rate, and voice selection. |
| **Alternatives rejected** | **ElevenLabs / Google Cloud TTS** — better voices but need API keys and cost money. Overkill for prototype. |

---

## 3. Component Breakdown

### 3.1 Microphone Input (`mic-input.js`)

**Responsibility:** Capture raw audio from the user's microphone and provide two outputs: a `MediaStream` for speech recognition, and an `AudioContext` pipeline for feature extraction.

**How it works:**
1. Call `navigator.mediaDevices.getUserMedia({ audio: true })`
2. Create an `AudioContext` and connect the stream as a source node
3. Fork the signal:
   - Branch A → `SpeechRecognition` (gets the raw MediaStream)
   - Branch B → `AnalyserNode` → feature extraction pipeline
4. Expose start/stop controls and a "stream ready" event

**Key design choice:** One mic stream, two consumers. The `MediaStream` goes directly to Speech Recognition. The `AudioContext` source goes to the AnalyserNode for emotion features. This avoids requesting mic permission twice.

### 3.2 Speech-to-Text (`speech-to-text.js`)

**Responsibility:** Convert the user's speech into text strings.

**How it works:**
1. Create a `SpeechRecognition` instance with `continuous: true`, `interimResults: true`
2. On `result` event, emit recognized text
3. Handle `end` event to auto-restart (for continuous listening mode)
4. Emit events: `onInterimResult(text)`, `onFinalResult(text)`, `onError(err)`

**Fallback:** If `SpeechRecognition` is unavailable, show a text input box so the user can type instead. Emotion detection still works from voice even if STT fails.

### 3.3 Audio Feature Extraction (`audio-features.js`)

**Responsibility:** Extract prosody features from real-time audio for the emotion detector.

**Features to extract (per analysis window):**

| Feature | What it measures | How to get it |
|---------|-----------------|---------------|
| **Pitch (F0)** | How high/low the voice is | Autocorrelation on time-domain data from `AnalyserNode.getFloatTimeDomainData()` |
| **Energy (RMS)** | How loud the voice is | Root-mean-square of the time-domain samples |
| **Spectral Centroid** | "Brightness" of the voice | Weighted average of FFT frequency bins from `AnalyserNode.getFloatFrequencyData()` |
| **Zero Crossing Rate** | Voice roughness/breathiness | Count sign changes in time-domain data |
| **Speech Rate Proxy** | How fast they're talking | Energy envelope peak frequency (or use STT word timing) |
| **Pitch Variance** | Emotional expressiveness | Standard deviation of pitch over a window |

**Analysis window:** 2–3 seconds of audio, updated every ~500ms. This gives enough context without too much lag.

**Output format:** A flat Float32Array, e.g., `[pitch, pitchVar, energy, spectralCentroid, zeroCrossingRate, speechRate]` — fed directly into the emotion model.

**Decision on Meyda:** We start with hand-rolled extraction (pitch via autocorrelation, energy via RMS, spectral centroid from FFT bins). If we find we need proper MFCCs, we add `meyda` as a dependency. YAGNI until proven otherwise.

### 3.4 Emotion Detector (`emotion-detector.js`)

**Responsibility:** Take audio features and classify the current emotional state.

**See Section 4 for the deep dive.**

### 3.5 Text-to-Speech (`text-to-speech.js`)

**Responsibility:** Make Dekel speak a response out loud.

**How it works:**
1. Accept a text string and optional emotion context
2. Create a `SpeechSynthesisUtterance`
3. Optionally adjust `pitch` and `rate` based on context (e.g., speak more gently when user is stressed)
4. Queue the utterance via `speechSynthesis.speak()`
5. Emit `onStart`, `onEnd`, `onError` events

**Voice selection:** Pick a voice that sounds supportive. Prefer English voices with `localService: false` (network voices tend to sound more natural). Fall back to whatever's available.

### 3.6 Dekel Brain (`dekel-brain.js`)

**Responsibility:** The "decision center" — takes text + emotion and produces a response.

**How it works:**
1. Receive: `{ text: "I feel tired", emotion: "stressed", confidence: 0.72 }`
2. Use simple rule-based logic to generate a supportive response:
   - If stressed → calming response
   - If happy → encouraging response
   - If calm → reflective response
   - If uncertain (low confidence) → gentle check-in: "How are you feeling right now?"
3. Pass the response text to `text-to-speech.js`

**This is NOT an LLM.** It's a simple response mapper. We can upgrade later, but for the prototype, a rule-based system is clearer and more explainable.

### 3.7 UI Controller (`ui.js`)

**Responsibility:** Manage the visual interface — record button, transcript display, emotion indicator, Dekel's response display.

### 3.8 App Controller (`app.js`)

**Responsibility:** Wire everything together. The main entry point.

**Flow:**
1. User clicks "Talk to Dekel" button
2. `mic-input` starts capturing
3. `speech-to-text` begins recognizing words
4. `audio-features` begins extracting prosody features
5. `emotion-detector` classifies emotion from features
6. When user stops talking (pause detected or button released):
   - `dekel-brain` receives `{ text, emotion, confidence }`
   - Brain generates a response
   - `text-to-speech` speaks the response
7. UI updates throughout: shows transcript, emotion indicator, Dekel's reply

---

## 4. Emotion Detection — Deep Dive

### 4.1 Model Approach

**Choice: TensorFlow.js with a small dense neural network (MLP)**

Architecture:
```
Input (6 features) → Dense(32, relu) → Dense(16, relu) → Dense(5, softmax)
```

Why a simple MLP and not a CNN or RNN?
- Our input is a small feature vector (6 numbers), not a raw spectrogram
- An MLP is the simplest model that can learn non-linear boundaries between emotions
- It loads fast, runs fast, and is easy to explain: "The model takes 6 numbers describing your voice and guesses which emotion they match"

**Alternative considered:** A CNN on mel-spectrograms. Rejected because it requires heavier preprocessing, larger model, and is harder to explain. If the MLP approach proves insufficient, this is the upgrade path.

### 4.2 Audio Features (Model Input)

The model receives a 6-dimensional feature vector extracted per analysis window:

1. **Mean Pitch (F0)** — Higher pitch often correlates with excitement or stress
2. **Pitch Variance** — Monotone = calm or sad; varied = happy or stressed
3. **Energy (RMS)** — Louder = stressed or happy; quieter = calm or sad
4. **Spectral Centroid** — "Brighter" voice often indicates arousal/excitement
5. **Zero Crossing Rate** — Higher for stressed/angry speech
6. **Speech Rate** — Faster = stressed or happy; slower = calm or sad

These features are normalized (z-score or min-max) before feeding to the model.

### 4.3 Emotion Set

| Emotion | Description | Voice signature |
|---------|-------------|----------------|
| **Calm** | Relaxed, at ease | Low pitch, low variance, moderate energy, slow rate |
| **Stressed** | Tense, anxious | Higher pitch, high variance, high energy, fast rate |
| **Happy** | Cheerful, positive | Higher pitch, high variance, moderate-high energy, moderate rate |
| **Sad** | Down, low energy | Low pitch, low variance, low energy, slow rate |
| **Neutral** | Default / baseline | Mid-range on all features |

**Why these 5?**
- They map to distinct prosody patterns (separable by our features)
- They're meaningful for a psychologist context (Dekel needs to know if someone is stressed)
- 5 categories is enough to be useful without being so many that the model struggles
- "Neutral" serves as the catch-all when nothing else is confident

**Why not angry/fearful/disgusted?**
- Angry and stressed have very similar prosody patterns — hard to separate with simple features
- Fear and disgust require more nuanced detection
- Keep it simple. 5 is enough for the prototype.

### 4.4 Confidence Scoring & Fallback

The softmax output gives us probabilities for each emotion. We use these as confidence scores.

**Rules:**
- If the top emotion has confidence ≥ 0.55 → use it
- If the top emotion has confidence 0.40–0.54 → use it but flag as "uncertain"
- If no emotion exceeds 0.40 → fall back to "neutral" with a note of uncertainty

**Fallback behavior when uncertain:**
- Dekel says something like: "I'm not sure how you're feeling. Can you tell me more?"
- The UI shows a "?" instead of a definitive emotion icon
- The system logs the uncertain classification for potential model improvement

**Why 0.55?** With 5 classes, random chance is 0.20. A threshold of 0.55 means the model is meaningfully more confident than random, but not so strict that we reject most predictions.

### 4.5 Training Data Strategy

**Phase 1 (Prototype): Use a pre-trained model or synthetic training data**

Options, in order of preference:
1. **RAVDESS dataset** — Ryerson Audio-Visual Database of Emotional Speech and Song. Contains ~1,400 audio files with labeled emotions. Well-known, freely available for research. We extract our 6 features from these files and train the MLP offline.
2. **SAVEE or EmoDB** — alternative speech emotion datasets if RAVDESS doesn't work out
3. **Teachable Machine for bootstrapping** — record samples ourselves and use them to validate our feature extraction pipeline before full training

**Training pipeline:**
1. Download RAVDESS audio files
2. Extract features (pitch, energy, spectral centroid, ZCR, speech rate, pitch variance) from each file using Python (librosa) or JavaScript (offline)
3. Map RAVDESS emotion labels to our 5-category set
4. Train the MLP in Python (Keras/TF) → export to TensorFlow.js format (`model.json` + weights)
5. Load the model in-browser with `tf.loadLayersModel()`

**Phase 2 (Future): Fine-tune with real user data** — not in scope for prototype.

---

## 5. File & Folder Structure

```
space-sound-project/
├── docs/
│   ├── PRD.md                    # Product requirements
│   ├── architecture.md           # This document
│   └── tasks.md                  # Task allocation
├── src/
│   ├── index.html                # Main HTML page
│   ├── css/
│   │   └── styles.css            # Styling (space theme)
│   ├── js/
│   │   ├── app.js                # Main controller — wires everything
│   │   ├── mic-input.js          # Microphone capture module
│   │   ├── speech-to-text.js     # Web Speech API STT wrapper
│   │   ├── text-to-speech.js     # Web Speech API TTS wrapper
│   │   ├── audio-features.js     # Prosody feature extraction
│   │   ├── emotion-detector.js   # TensorFlow.js emotion classifier
│   │   ├── dekel-brain.js        # Response logic (text + emotion → reply)
│   │   └── ui.js                 # UI updates and DOM management
│   └── model/
│       ├── model.json            # TF.js model architecture
│       └── group1-shard1of1.bin  # Model weights
├── tests/
│   ├── mic-input.test.js         # Mic module tests
│   ├── speech-to-text.test.js    # STT tests
│   ├── text-to-speech.test.js    # TTS tests
│   ├── audio-features.test.js    # Feature extraction tests
│   ├── emotion-detector.test.js  # Emotion model tests
│   ├── dekel-brain.test.js       # Brain logic tests
│   └── integration.test.js       # End-to-end flow tests
├── training/
│   ├── extract_features.py       # Feature extraction from RAVDESS
│   ├── train_model.py            # Train the emotion MLP
│   └── export_tfjs.py            # Export to TF.js format
├── package.json
└── README.md
```

---

## 6. Limitations & Assumptions

### Assumptions
- Chrome or Edge browser with microphone permission granted
- Internet connection available (needed for Web Speech API's STT)
- User speaks English (STT language is set to `en-US`)
- Audio environment is reasonably quiet (no heavy background noise)

### Limitations
- **Emotion detection is approximate.** This is a prototype, not a clinical tool. The model will make mistakes, especially with ambiguous emotions.
- **Calm vs. Sad is hard to distinguish** from prosody alone — they have similar low-energy, low-pitch signatures. The model may confuse them.
- **Web Speech API is a black box.** We can't control its accuracy or speed. It may lag or produce errors.
- **No speaker diarization.** If multiple people talk, the system won't know who's speaking.
- **No persistent memory.** Dekel doesn't remember previous conversations. Each session starts fresh.
- **TTS voices vary by OS/browser.** The voice may sound different on different machines.
- **Model accuracy depends on training data quality.** RAVDESS is acted speech — real conversational emotion may differ.
- **Privacy consideration.** Web Speech API sends audio to Google servers for STT. Users should be informed.

### What this prototype CAN do
- Listen to a user speak via microphone
- Transcribe what they said
- Estimate their emotional state from voice prosody
- Respond with a supportive spoken message
- Show the detected emotion and confidence visually

### What this prototype CANNOT do
- Replace a real psychologist
- Detect complex emotions (sarcasm, mixed feelings)
- Work offline (STT needs internet)
- Handle noisy environments well
- Remember past conversations

---

## 7. Architecture Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | Use Web Speech API for STT (not Whisper.js) | Built-in, free, no setup. Accuracy is good enough for prototype. |
| AD-2 | Use Web Speech API for TTS (not cloud TTS) | Free, built-in, zero-config. Voice quality is acceptable. |
| AD-3 | Use TensorFlow.js with a small MLP (not CNN on spectrograms) | Simpler, faster, explainable. Feature vector input, not raw audio. |
| AD-4 | Extract 6 prosody features (not raw audio) | Keeps the model small and fast. Features are interpretable. |
| AD-5 | 5-emotion set (not 7+ emotions) | Distinct prosody signatures, meaningful for context, manageable scope. |
| AD-6 | Rule-based response logic (not LLM) | Explainable to children. Deterministic. No API costs. |
| AD-7 | Start without Meyda library | YAGNI. Add it if hand-rolled features prove insufficient. |
| AD-8 | Train on RAVDESS dataset | Freely available, well-labeled, standard in speech emotion research. |
| AD-9 | Confidence threshold at 0.55 | Meaningfully above random (0.20) without being too restrictive. |
| AD-10 | Fallback to "neutral" + verbal check-in | Graceful degradation when model is uncertain. |
