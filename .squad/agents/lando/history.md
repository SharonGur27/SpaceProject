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
