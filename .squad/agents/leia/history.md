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

### 2026-04-10 — STT Error Handler Button-Stuck Bug Fix

**Bug:** When speech recognition hit a non-recoverable error (network, not-allowed, service-not-allowed), `isListening` was set to `false` but the Talk button remained in "🛑 Stop" state with the `listening` CSS class. User was stuck — clicking Stop called `stopListening()` which returned early because `isListening` was already false.

**Root cause:** `showSpeechUnavailable()` and `showError()` in ui.js only updated status text, not button state.

**Fix (app.js):**
- Non-recoverable path: Added `ui.setStatus('ready')` before `ui.showSpeechUnavailable()` to reset button
- Recoverable path: Added `isListening = false`, `ui.setStatus('ready')`, and `cleanup()` — the same bug existed here too

**Fix (ui.js — defensive):**
- `showSpeechUnavailable()` now resets the talk button (text, class, disabled) before showing its message
- `showError()` now also resets the talk button — any error display ensures the user isn't stuck

**Pattern:** Error display functions in ui.js should always ensure the button is in a clickable, non-listening state. Defense in depth: both the caller (app.js) and the UI function (ui.js) reset the button.

**Tests:** All 188 tests passing after fix.

### 2026-04-10 — STT Reliability Improvements (Backoff, Retry, Feedback)

**Problem:** Sharon reported speech recognition "sometimes works and sometimes doesn't." Root causes identified:
1. Fixed 300ms restart delay caused hammering of Google's speech servers after repeated restarts
2. A single transient network error immediately showed "speech unavailable" with no retry
3. Stale SpeechRecognition instances after errors caused unpredictable behavior in Chrome
4. No silence detection — recognition could silently stall without user feedback
5. No user feedback during reconnection — users saw nothing between "working" and "failed"

**Improvements (speech-to-text.js):**
- **Exponential backoff:** Restart delay grows from 300ms → 5s (1.5× multiplier, capped). Resets to 300ms on successful results.
- **Network retry:** 3 attempts for transient errors (network, audio-capture) before reporting failure. Previously 1 error = immediate death.
- **Fresh instances:** New SpeechRecognition object created on every restart, not just on initial start(). Chrome has bugs with reused instances after errors.
- **Silence timeout:** 15-second timer restarts recognition proactively if no results arrive. Catches silent connection drops.
- **onStatusChange callback:** New API — notifies the app with `{ state: 'reconnecting'|'failed', attempt, maxAttempts, reason }` so UI can show appropriate feedback.
- **Diagnostic logging:** All console messages include retry counts, timing info, and restart numbers.

**Improvements (app.js):**
- Wired `stt.onStatusChange()` to show "🔄 Reconnecting speech…" during retries
- Simplified error handler — network errors only reach it after retries are exhausted

**Improvements (ui.js):**
- Added `setStatusText(text, color)` for custom one-off status messages (not tied to standard states)

**Tests:** Updated network error test to verify retry behavior (4 errors needed to trigger callback). All 188 tests passing.

**Key insight:** The Web Speech API sends audio to Google's servers. It's fundamentally network-dependent. Most "intermittent failures" are transient network glitches that resolve on retry. The old code treated every error as fatal.

### 2026-04-10 — Speech Recognition Second-Session Failure Fix

**Bug:** Speech recognition worked on first Talk press, but after stopping and pressing Talk again, STT started but produced no words. 100% reproducible.

**Root causes identified (4 interacting issues):**

1. **Chrome TTS `onend` dropout:** For long utterances (>15s), Chrome drops the `onend` event entirely. `tts.speak()` Promise never resolves, `processTranscript` hangs, button stays disabled at 'speaking' — user can never press Talk again.

2. **Stale STT `onend` state corruption:** `stt.stop()` fires `recognition.stop()` which triggers `onend` asynchronously. If the old `onend` fires after a new `stt.start()` has set `isListening = true`, it overwrites it to `false`, breaking the new session.

3. **processTranscript error leaves status stuck:** If brain or TTS throws, the catch block set status to 'ready' — but only in the catch. If TTS hung (cause #1), status stayed at 'speaking' forever.

4. **getUserMedia + SpeechRecognition mic contention:** On second call, Chrome briefly conflicts between the new getUserMedia stream and SpeechRecognition's internal mic access.

**Fixes applied:**

- **`text-to-speech.js`:** Added 30s watchdog timeout via `Promise.race()` that force-resolves `speak()` and calls `speechSynthesis.cancel()`. Added Chrome keepalive workaround (`speechSynthesis.pause(); speechSynthesis.resume()` every 10s during speech). Used `settleOnce` pattern to prevent double-resolution of the Promise.

- **`speech-to-text.js`:** Added `sessionId` counter, incremented on each `start()`. All event handlers (`onresult`, `onend`, `onerror`) capture their session's ID in closure and ignore events if it doesn't match the current `sessionId`. Auto-restart `setTimeout` also checks before proceeding.

- **`app.js` `stopListening()`:** Moved `ui.setStatus('ready')` into the `finally` block as a guaranteed backstop — the button can never get permanently stuck regardless of what fails.

- **`app.js` `startListening()`:** Added 100ms delay between `mic.start()` and `stt.start()` to avoid mic contention. Added detailed console logging (app isListening state, audioContext state) for future debugging.

**Tests:** All 188 tests passing after fix.

**Key insight:** Browser speech APIs have multiple async race conditions that only manifest on the second use cycle. The combination of stale event handlers, Chrome-specific TTS bugs, and mic resource contention creates a "works once, fails twice" pattern that requires defense-in-depth fixes across all three modules.
