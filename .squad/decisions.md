# Squad Decisions

## Active Decisions

### 2026-04-08 — Async Test Patterns for LLM Integration

**Status:** Implemented  
**Author:** Lando (Tester)

Established patterns for testing async LLM API calls with fetch mocking, conversation history verification, and error handling. All tests written before implementation to guide Leia's API contract design. Test patterns verified across 37 new conversation-engine tests + 11 new dekel-brain async tests.

**Key patterns:**
- `async`/`await` for Promise-returning functions
- Global `fetch` mocking with `vi.fn()` and `mockResolvedValueOnce()`
- Module reset between tests (`vi.resetModules()`)
- History verification against API request body
- Edge case coverage (empty input, special chars, confidence boundaries, network errors)

**Impact:** 175 total tests passing, robust test suite for async conversational features.

---

### 2026-04-08 — Emotion Fallback v2 Scoring & Browser Norm Stats

**Status:** Implemented  
**Author:** Chewie (ML/Audio)

Fixed "always neutral" bug in emotion-fallback.js by:
1. Redesigning neutral scoring (residual capped at 0.3 instead of 1.0 base)
2. Increasing emotion weights (0.3–0.45) + threshold bonuses (+0.2 to +0.4)
3. Lowering softmax temperature (2.0 → 1.0) for peakier distributions
4. Recalibrating DEFAULT_NORM_STATS for browser getUserMedia audio levels
5. Halving SILENCE_THRESHOLD (0.01 → 0.005)

**Verification:** All 43 tests passing, manual testing confirms all 5 emotions can win based on prosody input.

**Impact:** Emotion detection now produces meaningful variance in fallback mode. No breaking changes.

---

### 2026-04-09 — LLM Conversation Engine Integration

**Status:** Implemented  
**Author:** Leia (Frontend Dev)

Integrated OpenAI Chat Completions API to enable contextual responses. Dekel now responds to both HOW the user feels (emotion) and WHAT they said (content).

**Implementation:**
- **New module:** conversation-engine.js — OpenAI integration, 10-turn history, OARS system prompt
- **Refactored:** dekel-brain.js — Async with LLM-first flow, template fallback
- **API key storage:** sessionStorage (not localStorage) — session-scoped for security
- **UI additions:** Settings panel for API key, scrollable chat history, API status indicator
- **Model:** gpt-4o-mini (default, configurable)
- **Response quality:** max_tokens=200, temp=0.7, presence_penalty=0.6, frequency_penalty=0.3

**Graceful degradation:** Works perfectly without API key (template fallback). Network errors don't break experience.

**Rationale:**
- Templates can't reference specific content ("the oxygen leak", "your family")
- Multi-turn context hard to manage with rules
- Educational demo context — browser-only, no backend complexity
- OpenAI supports CORS for direct browser access

**Alternatives rejected:**
- Proxy server for API calls (adds deployment complexity)
- localStorage for API key (security concern)
- LLM-only mode (breaks experience when unavailable)
- Rule-based NLU (hard to build, limited flexibility)

**Testing:** 37 new tests for engine, 11 new async tests for dekel-brain. All 175 tests passing.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
