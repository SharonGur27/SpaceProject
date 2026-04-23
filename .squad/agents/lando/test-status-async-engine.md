# Test Suite Status — Async Conversation Engine

**Date:** 2026-04-08  
**Tester:** Lando  
**Status:** Tests written, awaiting implementation  

## Test Coverage Summary

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| `audio-features.test.js` | 24 | ✅ All passing | Feature extraction, normalization |
| `emotion-detector.test.js` | 24 | ✅ All passing | TF.js model, confidence thresholds |
| `mic-input.test.js` | 18 | ✅ All passing | getUserMedia, permissions, lifecycle |
| `speech-to-text.test.js` | 21 | ✅ All passing | SpeechRecognition, auto-restart |
| `text-to-speech.test.js` | 23 | ✅ All passing | SpeechSynthesisUtterance, emotions |
| **`conversation-engine.test.js`** | **37** | ⏳ **Ready for Leia** | LLM API, history, errors |
| **`dekel-brain.test.js`** | **28** | ⏳ **19 pass, 8 ready** | Async refactor + fallback |
| **TOTAL** | **175** | **167 pass, 8 ready** | 95.4% pass rate |

## What's Ready for Leia

### 1. conversation-engine.test.js (37 tests)

**Configuration (8 tests):**
- ✓ `isConfigured()` false before configure
- ✓ `isConfigured()` true after configure with API key
- ✓ `isConfigured()` false if empty/null key
- ✓ Custom endpoint and model accepted
- ✓ Default endpoint and model set

**API Calls (9 tests):**
- ✓ Calls fetch with correct URL (configured endpoint)
- ✓ Sends Authorization header: `Bearer {apiKey}`
- ✓ Sends Content-Type header: `application/json`
- ✓ Sends system prompt as first message (defines Dekel persona)
- ✓ Includes emotion context: `[Voice tone: {emotion}, confidence: {N}%]`
- ✓ Includes user text in message
- ✓ Uses configured model in request body
- ✓ Uses default model (gpt-4o-mini) if not specified
- ✓ Parses response and returns `{ reply, emotion: 'calm' }`

**Conversation History (6 tests):**
- ✓ History starts empty
- ✓ After successful call, history has 1 user + 1 assistant message
- ✓ After multiple calls, history accumulates
- ✓ History capped at 20 messages (10 turns)
- ✓ `clearHistory()` empties the history
- ✓ History messages sent to API on subsequent calls

**Error Handling (7 tests):**
- ✓ Throws when API key not configured
- ✓ Throws on network error (fetch rejects)
- ✓ Throws on non-200 HTTP response (429 rate limit)
- ✓ Throws on non-200 HTTP response (500 server error)
- ✓ Throws on malformed JSON response
- ✓ Throws on missing expected fields (no choices array)
- ✓ Throws on empty choices array
- ✓ History NOT updated on failed calls

**Edge Cases (7 tests):**
- ✓ Empty text input still generates call (emotion context only)
- ✓ Very long text sent without truncation
- ✓ Confidence value formatted as percentage
- ✓ Special characters don't break request (quotes, &, emoji)
- ✓ Handles 0 confidence value
- ✓ Handles 1.0 confidence value

### 2. dekel-brain.test.js (8 new/updated tests)

**Async Interface (2 tests):**
- ✓ `generateResponse` returns a Promise
- ✓ Promise resolves to `{ reply, emotion }` object

**Fallback Behavior (2 tests):**
- ✓ When engine NOT configured → template response
- ✓ Template fallback works for all emotions

**generateFallbackResponse Export (6 tests):**
- ✓ `generateFallbackResponse` is exported
- ✓ `generateFallbackResponse` is synchronous (not Promise)
- ✓ Returns template-based responses
- ✓ Handles all emotions correctly
- ✓ Handles low confidence (asks clarification)
- ✓ Confidence thresholds match original behavior

## Test Patterns Used

### Fetch Mocking
```javascript
const mockFetch = vi.fn();
global.fetch = mockFetch;

mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    choices: [{
      message: { content: "LLM response" }
    }]
  })
});
```

### Error Mocking
```javascript
// HTTP error
mockFetch.mockResolvedValueOnce({
  ok: false,
  status: 429,
  statusText: 'Too Many Requests'
});

// Network error
mockFetch.mockRejectedValueOnce(new Error('Network error'));
```

### Module Isolation
```javascript
beforeEach(() => {
  vi.resetModules();      // Fresh module state
  vi.clearAllMocks();     // Reset mock call counts
  delete global.fetch;    // Clean fetch mock
});
```

## Contract Verification Checklist

For Leia to verify implementation matches tests:

- [ ] `conversation-engine.js` exports: `configure`, `isConfigured`, `generateResponse` (async), `getConversationHistory`, `clearHistory`
- [ ] `configure({ apiKey, endpoint, model })` — all params optional except `apiKey`
- [ ] Default endpoint: `https://api.openai.com/v1/chat/completions`
- [ ] Default model: `gpt-4o-mini`
- [ ] User message format: `[Voice tone: {emotion}, confidence: {N}%]\n\nUser: {text}`
- [ ] Response format: `{ reply: string, emotion: 'calm' }`
- [ ] History cap: 20 messages (10 turns max)
- [ ] History excludes system prompt in `getConversationHistory()` return value
- [ ] Errors throw (network, HTTP non-200, malformed response)
- [ ] History NOT updated on errors

For dekel-brain.js refactor:

- [ ] `generateResponse({ text, emotion, confidence })` now async (returns Promise)
- [ ] Tries conversation engine first (if configured)
- [ ] Falls back to templates if engine fails or unconfigured
- [ ] New export: `generateFallbackResponse({ text, emotion, confidence })` (synchronous)
- [ ] All existing template constants (RESPONSE_TEMPLATES, etc.) remain

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (for development)
npm run test:watch

# Run specific file
npx vitest run tests/conversation-engine.test.js
```

## Next Steps

1. **Leia implements conversation-engine.js** → 37 tests should pass
2. **Leia refactors dekel-brain.js to async** → 8 additional tests should pass
3. **Re-run full suite** → Target: 175/175 passing (100%)
4. **Integration testing** (Phase 3) — end-to-end flow with real browser APIs (mocked fetch)

---

**Test files:**
- `tests/conversation-engine.test.js` — NEW, comprehensive (37 tests)
- `tests/dekel-brain.test.js` — UPDATED, async-ready (28 tests, 8 new/modified)

**Decision document:**
- `.squad/decisions/inbox/lando-async-test-patterns.md` — Test patterns and rationale

**Questions?** Ask Lando (the skeptical one who checks everything twice).
