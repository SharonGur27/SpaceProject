# Decision: Whisper STT via Groq API as Web Speech Fallback

**Date:** 2026-04-22  
**Author:** Chewie (ML/Audio)  
**Status:** Implemented

## Context

Chrome's Web Speech API (Google speech service) produces frequent `network` errors, breaking the conversation flow. The user already has a Groq API key configured for LLM conversations.

## Decision

Added `src/js/whisper-stt.js` — a MediaRecorder-based module that sends audio to Groq's Whisper API (`whisper-large-v3-turbo`) as an alternative STT backend.

Integrated into `app.js` with a three-mode strategy (`localStorage: dekel-stt-provider`):
- **auto** (default): Start with Web Speech, auto-switch to Whisper after 2+ network errors
- **whisper**: Always use Whisper
- **webspeech**: Always use Web Speech (original behavior)

## Rationale

- Groq's Whisper is free-tier, fast (~1s latency), and the API key is already available
- MediaRecorder → webm/opus is universally supported in Chrome/Edge
- Auto-switch avoids user intervention while preserving Web Speech when it works (lower latency, interim results)
- Same callback interface (`onFinalResult`, `onError`) means zero changes needed downstream

## Trade-offs

- **No interim results in Whisper mode** — user sees "Recording…" instead of live text. Acceptable for a fallback.
- **Depends on Groq API availability** — but if both Google and Groq are down, text input fallback still works.
- **Audio sent to external API** — same trust model as the LLM conversation (user already opted in with their API key).

## Impact

- No breaking changes to existing Web Speech path
- 204 tests passing (16 new)
- Leia: can add UI toggle for `dekel-stt-provider` in settings panel
- Lando: new test patterns for MediaRecorder + fetch mocking
