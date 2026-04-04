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
