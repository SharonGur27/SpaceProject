# Project Context

- **Owner:** Sharon Gur
- **Project:** Dekel — a supportive virtual psychologist for astronauts (educational prototype)
- **Stack:** Browser-based (Chrome/Edge), JavaScript, Web Audio API, Web Speech API, TensorFlow.js
- **Focus:** Voice input, speech output, emotion detection from voice prosody
- **Goal:** Working, understandable prototype — explainable to children
- **Created:** 2026-04-02

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-04 — Architecture Design Complete

- **Architecture docs:** `docs/architecture.md` (blueprint), `docs/tasks.md` (task allocation)
- **Key decisions:**
  - Web Speech API for both STT and TTS — built-in, free, no setup
  - TensorFlow.js with small MLP (6 features → 5 emotions), not CNN on spectrograms
  - 5-emotion set: calm, stressed, happy, sad, neutral — distinct prosody signatures
  - Rule-based response logic in dekel-brain.js, not LLM
  - RAVDESS dataset for training, export to TF.js format
  - Start without Meyda.js — hand-roll feature extraction, upgrade if needed
  - Confidence threshold at 0.55, fallback to neutral with verbal check-in
- **File structure:** `src/js/` for 8 modules, `src/model/` for TF.js model, `training/` for Python pipeline, `tests/` for all tests
- **Team split:** Leia owns browser I/O + UI + brain, Chewie owns audio features + model + training, Lando owns all tests
- **Critical handoff:** Chewie's audio-features.js output (Float32Array of 6) feeds emotion-detector.js. Chewie owns both sides. Leia's app.js wires everything.
- **User preference:** Sharon wants the solution explainable to children. Architecture uses "two ears" metaphor.

### 2026-04-04 — Architecture Finalized & Logged

- **Status:** Architecture design complete, decision documented in `.squad/decisions/decisions.md`
- **Orchestration log:** `.squad/orchestration-log/2026-04-04T17-55-han.md`
- **Session log:** `.squad/log/2026-04-04T17-55-architecture-design.md`
- **Next action:** Await team review & kickoff Phase 1 (Leia/Chewie/Lando parallel work)

### 2026-04-22 — Phase 3: Conversation Engine Built (LLM-First + Template Fallback)

**New architecture layer added above emotion detection:**
- **conversation-engine.js** (Leia): OpenAI Chat Completions integration, 10-turn history, OARS-style system prompt
- **dekel-brain.js refactored** (Leia): Now async. LLM-first flow with graceful template fallback. Maintains 5-emotion system.
- **UI enhancements** (Leia): Settings panel for API key, chat history display, API status indicator
- **Test suite expanded** (Lando): 37 new engine tests + 11 new async dekel-brain tests = 175 total passing

**Key insight:** Dekel can now respond to WHAT users say (content) + HOW they say it (emotion). Templates remain as robust fallback when API unavailable.

**Status:** Conversation engine complete. Tests passing. Ready for integration testing and real API testing.
