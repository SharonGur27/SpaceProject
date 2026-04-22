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

### Phase 2 Complete — Integration Layer Built (2026-04-07)

**Delivered Files:**
- `src/js/dekel-brain.js` — Rule-based response generator with emotion-appropriate templates. High/medium confidence tiers, low-confidence fallback to gentle check-ins. Responses are 2-3 sentences max, supportive tone.
- `src/js/ui.js` — UI controller managing all DOM interactions. Status colors (green/blue/orange/purple), emotion emojis (😌😰😊😔❓), talk button toggle mode, transcript/response display, fallback text input.
- `src/js/app.js` — Main orchestrator wiring all Phase 1 modules. Full conversation flow: button → mic+STT+features → user speaks → stop → emotion detection → brain response → TTS. Handles AnalyserNode creation and connection, error handling at each step, cleanup on stop.
- `src/index.html` — Complete UI markup with TensorFlow.js CDN, semantic HTML, accessibility attributes (aria-live, aria-label), fallback text input for browsers without Web Speech API.
- `src/css/styles.css` — Space-themed design with animated stars background, dark gradient (deep blue/purple), calming colors, responsive layout, accessibility features (reduced-motion support, focus-visible styles).

**Architecture Decisions:**
- **AnalyserNode wiring:** app.js creates analyser from mic's AudioContext, connects sourceNode → analyser (no destination to avoid feedback), passes to audio-features.init()
- **Confidence thresholds in brain:** High ≥0.65, Medium ≥0.45, Low <0.45 triggers uncertain responses
- **Status flow:** ready → listening → processing → speaking → ready
- **Error handling:** Each module (mic, STT, TTS) has error callbacks wired to UI feedback
- **TTS/mic coordination:** TTS onStart/onEnd handlers update status; mic stopped before TTS to avoid feedback
- **Button UX:** Toggle mode (press to start, press again to stop), disabled during processing/speaking

**Key Patterns:**
- All modules use both default and named exports for flexibility
- Console logs at each step for debugging visibility
- Graceful degradation: text input fallback if Web Speech API unavailable
- Automatic fallback: emotion-detector switches to rule-based if TF model can't load

**Integration Points Verified:**
- Feature order: [pitch, pitchVar, energy, centroid, zcr, speechRate] ✓
- Emotion labels: calm, stressed, happy, sad, neutral ✓
- Confidence scoring: 0-1 range, model threshold 0.55, uncertain flag 0.40 ✓
- TTS emotion presets: calm, stressed, happy, sad, neutral (pitch/rate adjustments) ✓

**User Experience:**
- Simple enough for a child to understand (one button, clear status, emoji emotions)
- Calming space theme reduces anxiety
- Supportive responses tailored to astronaut context
- Accessible (keyboard nav, screen reader support, reduced motion)

### 2026-04-09 — LLM Conversation Engine Integration

**Delivered Files:**
- `src/js/conversation-engine.js` — NEW: LLM API integration module for OpenAI Chat Completions API. Manages conversation history (10 turns), configurable API key/endpoint/model. System prompt defines Dekel's therapeutic personality (reflect+validate → respond to content → open question). Default model: gpt-4o-mini (cost-effective).
- `src/js/dekel-brain.js` — REFACTORED: Now async, tries LLM first (if configured), falls back to templates on error or when no API key. Exported `generateFallbackResponse()` preserves all original template logic. `setEngine()` for testing.
- `src/js/app.js` — UPDATED: Handles async brain.generateResponse() with await. Initializes conversation engine with sessionStorage API key on load. Wires up API key submit and clear history handlers. Adds messages to history via ui.addToHistory().
- `src/js/ui.js` — UPDATED: Added settings panel for API key input, conversation history display with chat-style messages, API status indicator. New exports: onApiKeySubmit(), onClearHistory(), addToHistory(), clearConversationHistory(), setApiStatus().
- `src/index.html` — UPDATED: Added collapsible settings section with API key input and warning. Added conversation history section with clear button. Kept existing emotion indicator and response sections.
- `src/css/styles.css` — UPDATED: Styled settings panel (collapsible details, input row, status indicator), conversation history (chat bubbles, user vs dekel styling, scrollbar), responsive mobile styles.

**Architecture Decisions:**
- **LLM-first with graceful fallback:** Always try LLM if API key is configured. On error (network, rate limit, etc.), automatically fall back to template-based responses. App works perfectly without API key.
- **Context-aware responses:** LLM receives both emotion label AND user's actual words, plus conversation history (10 turns). System prompt emphasizes Motivational Interviewing techniques (reflection, validation, open questions).
- **Security/Privacy:** API key stored in sessionStorage (not localStorage) — persists within browser session only. Warning displayed in UI. Direct browser-to-API calls (OpenAI supports CORS).
- **Conversation history UI:** Separate scrollable chat display shows full back-and-forth. User messages (blue, right-aligned) vs Dekel messages (purple, left-aligned). Auto-scrolls to latest. Clear button resets both UI and engine history.
- **Model selection:** gpt-4o-mini as default — fast, cheap, sufficient for educational demo. Configurable via engine.configure().
- **Token limits:** max_tokens: 200 to keep responses concise (3-4 sentences). Temperature: 0.7 for natural variation. Presence penalty: 0.6, frequency penalty: 0.3 to reduce repetition.

**Integration Points:**
- sessionStorage key: 'dekel-api-key' — auto-loaded on init
- Conversation history max: 10 turns (20 messages: user+assistant pairs)
- System prompt defines Dekel's personality: supportive, uses MI techniques, 12-year-old-friendly language
- Error handling: LLM failures trigger console.warn + automatic fallback, no user-facing error
- Text fallback path also calls processTranscript() and adds to history

**Key Patterns:**
- Async/await throughout: generateResponse is now Promise-based
- Graceful degradation: full functionality without API key
- Separation of concerns: conversation-engine.js is fully testable in isolation
- Progressive enhancement: existing template responses preserved as fallback

**Testing:**
- All existing tests pass (7 test files, 28 dekel-brain tests, 37 conversation-engine tests)
- Tests verify: async behavior, fallback logic, configuration, API call structure
- console.log statements show LLM vs fallback usage

**Key Files:**
- `src/js/conversation-engine.js` (new)
- `src/js/dekel-brain.js` (refactored to async + LLM integration)
- `src/js/app.js` (async handling + engine config)
- `src/js/ui.js` (settings panel + chat history)
- `src/index.html` (new UI sections)
- `src/css/styles.css` (chat + settings styles)
