import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────
// conversation-engine.js — LLM-Based Conversation Tests
//
// Interface under test:
//   configure({ apiKey, endpoint, model })
//   isConfigured() → boolean
//   generateResponse({ text, emotion, confidence }) → Promise<{ reply, emotion }>
//   getConversationHistory() → array
//   clearHistory()
//
// This module calls OpenAI Chat Completions API
// and maintains conversation history (last 10 turns max)
// ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  
  // Reset fetch mock
  delete global.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Configuration Tests ──────────────────────────────

describe('conversation-engine', () => {

  describe('configure()', () => {

    it('isConfigured() returns false before configure is called', async () => {
      const { isConfigured } = await import('../src/js/conversation-engine.js');
      
      expect(isConfigured()).toBe(false);
    });

    it('isConfigured() returns true after configure with API key', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key-12345' });
      
      expect(isConfigured()).toBe(true);
    });

    it('isConfigured() returns false if configure called with empty key', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: '' });
      
      expect(isConfigured()).toBe(false);
    });

    it('isConfigured() returns false if configure called with null key', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: null });
      
      expect(isConfigured()).toBe(false);
    });

    it('configure() accepts custom endpoint', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({
        apiKey: 'sk-test-key',
        endpoint: 'https://custom-api.example.com/v1/chat/completions'
      });
      
      expect(isConfigured()).toBe(true);
    });

    it('configure() accepts custom model', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({
        apiKey: 'sk-test-key',
        model: 'gpt-4'
      });
      
      expect(isConfigured()).toBe(true);
    });

    it('configure() sets default endpoint if not provided', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });
      
      // Should still be configured (endpoint defaults to OpenAI)
      expect(isConfigured()).toBe(true);
    });

    it('configure() sets default model if not provided', async () => {
      const { configure, isConfigured } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });
      
      // Should still be configured (model defaults to gpt-4o-mini)
      expect(isConfigured()).toBe(true);
    });
  });

  // ── API Call Tests (with fetch mock) ────────────────

  describe('generateResponse() API calls', () => {

    it('calls fetch with correct URL (configured endpoint)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: "I hear you. That sounds challenging."
            }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({
        apiKey: 'sk-test-key',
        endpoint: 'https://test-api.com/v1/chat/completions'
      });

      await generateResponse({
        text: 'I feel stressed',
        emotion: 'stressed',
        confidence: 0.8
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.com/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('sends correct Authorization header', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I understand." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-abc-123' });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe('Bearer sk-test-abc-123');
    });

    it('sends correct Content-Type header', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Got it." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Test',
        emotion: 'calm',
        confidence: 0.8
      });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('sends system prompt as first message', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I'm listening." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('Dekel');
      // System prompt should define the psychologist persona
      expect(body.messages[0].content.toLowerCase()).toMatch(/psychologist|supportive|astronaut/);
    });

    it('includes emotion context in user message', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'I feel stressed',
        emotion: 'stressed',
        confidence: 0.75
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      // Find the user message (should be second message after system)
      const userMessage = body.messages.find(m => m.role === 'user');
      
      expect(userMessage).toBeDefined();
      // High confidence (0.75) — tone included as secondary hint
      expect(userMessage.content).toContain('[Voice tone hint: "stressed", confidence: 75%');
      // Text should appear BEFORE the tone hint
      expect(userMessage.content.indexOf('I feel stressed')).toBeLessThan(userMessage.content.indexOf('[Voice tone hint'));
    });

    it('includes user text in the message', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Everything is overwhelming me',
        emotion: 'stressed',
        confidence: 0.8
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      const userMessage = body.messages.find(m => m.role === 'user');
      
      expect(userMessage.content).toContain('Everything is overwhelming me');
    });

    it('uses configured model in request body', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({
        apiKey: 'sk-test-key',
        model: 'gpt-4-turbo'
      });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.model).toBe('gpt-4-turbo');
    });

    it('uses default model (groq llama) if not specified', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      
      expect(body.model).toBe('llama-3.1-8b-instant');
    });

    it('parses response and returns reply with calm emotion', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: "I hear you. That sounds really challenging. What part feels hardest right now?"
            }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      const result = await generateResponse({
        text: 'I feel stressed',
        emotion: 'stressed',
        confidence: 0.8
      });

      expect(result).toBeDefined();
      expect(result.reply).toBe("I hear you. That sounds really challenging. What part feels hardest right now?");
      expect(result.emotion).toBe('calm');
    });
  });

  // ── Conversation History Tests ──────────────────────

  describe('conversation history', () => {

    it('history starts empty', async () => {
      const { getConversationHistory } = await import('../src/js/conversation-engine.js');
      
      const history = getConversationHistory();
      
      // Should only have system message or be empty (depending on implementation)
      expect(Array.isArray(history)).toBe(true);
      // History doesn't include system prompt in returned array
      expect(history.length).toBe(0);
    });

    it('after successful call, history contains 1 user + 1 assistant message', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I understand." }
          }]
        })
      });

      const { configure, generateResponse, getConversationHistory } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      const history = getConversationHistory();
      
      expect(history.length).toBe(2); // 1 user + 1 assistant
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    it('after multiple calls, history accumulates', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Hello there!" }
          }]
        })
      });

      // Second call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I hear you." }
          }]
        })
      });

      // Third call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Tell me more." }
          }]
        })
      });

      const { configure, generateResponse, getConversationHistory } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({ text: 'Hello', emotion: 'neutral', confidence: 0.7 });
      await generateResponse({ text: 'I feel stressed', emotion: 'stressed', confidence: 0.8 });
      await generateResponse({ text: 'Thanks', emotion: 'calm', confidence: 0.6 });

      const history = getConversationHistory();
      
      // 3 turns = 6 messages (3 user + 3 assistant)
      expect(history.length).toBe(6);
    });

    it('history is capped at MAX_HISTORY (10 turns = 20 messages)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // Mock 15 successful calls
      for (let i = 0; i < 15; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: `Response ${i}` }
            }]
          })
        });
      }

      const { configure, generateResponse, getConversationHistory } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      // Make 15 calls
      for (let i = 0; i < 15; i++) {
        await generateResponse({
          text: `Message ${i}`,
          emotion: 'neutral',
          confidence: 0.7
        });
      }

      const history = getConversationHistory();
      
      // Should be capped at 20 messages (10 turns * 2 messages per turn)
      expect(history.length).toBeLessThanOrEqual(20);
    });

    it('clearHistory() empties the history', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse, getConversationHistory, clearHistory } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      // Verify history has messages
      let history = getConversationHistory();
      expect(history.length).toBeGreaterThan(0);

      // Clear history
      clearHistory();

      // Verify history is empty
      history = getConversationHistory();
      expect(history.length).toBe(0);
    });

    it('history messages are sent to API on subsequent calls', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Nice to meet you!" }
          }]
        })
      });

      // Second call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I understand." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Hello, my name is Alex',
        emotion: 'neutral',
        confidence: 0.7
      });

      await generateResponse({
        text: 'I feel stressed today',
        emotion: 'stressed',
        confidence: 0.8
      });

      // Check second call includes history
      const secondCallArgs = mockFetch.mock.calls[1][1];
      const secondBody = JSON.parse(secondCallArgs.body);
      
      // Should have: system + first user + first assistant + second user
      expect(secondBody.messages.length).toBeGreaterThanOrEqual(4);
      
      // Verify previous conversation is included
      const messages = secondBody.messages;
      const userMessages = messages.filter(m => m.role === 'user');
      expect(userMessages.length).toBe(2);
      expect(userMessages[0].content).toContain('Alex');
    });
  });

  // ── Error Handling Tests ────────────────────────────

  describe('error handling', () => {

    it('throws when API key is not configured', async () => {
      const { generateResponse } = await import('../src/js/conversation-engine.js');
      
      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on network error (fetch rejects)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on non-200 HTTP response (429 rate limit)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on non-200 HTTP response (500 server error)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on malformed JSON response', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Unexpected token in JSON');
        }
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on response missing expected fields (no choices)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing choices array
          id: 'chatcmpl-123',
          model: 'gpt-4o-mini'
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('throws on response with empty choices array', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [] // Empty array
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await expect(
        generateResponse({
          text: 'Hello',
          emotion: 'neutral',
          confidence: 0.7
        })
      ).rejects.toThrow();
    });

    it('history is NOT updated on failed calls', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // First successful call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response 1" }
          }]
        })
      });

      // Second call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      });

      const { configure, generateResponse, getConversationHistory } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'First message',
        emotion: 'neutral',
        confidence: 0.7
      });

      const historyAfterSuccess = getConversationHistory();
      const lengthAfterSuccess = historyAfterSuccess.length;

      try {
        await generateResponse({
          text: 'Second message',
          emotion: 'neutral',
          confidence: 0.7
        });
      } catch (error) {
        // Expected to fail
      }

      const historyAfterFailure = getConversationHistory();
      
      // History should not have changed after failed call
      expect(historyAfterFailure.length).toBe(lengthAfterSuccess);
    });
  });

  // ── Edge Cases ──────────────────────────────────────

  describe('edge cases', () => {

    it('empty text input still generates a call (with emotion context)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I'm here to listen." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      const result = await generateResponse({
        text: '',
        emotion: 'stressed',
        confidence: 0.75
      });

      expect(result).toBeDefined();
      expect(result.reply).toBe("I'm here to listen.");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('very long text is still sent (no truncation)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I hear you." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      const longText = 'This is a very long message. '.repeat(100); // ~3000 chars

      await generateResponse({
        text: longText,
        emotion: 'neutral',
        confidence: 0.7
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const userMessage = body.messages.find(m => m.role === 'user');
      
      // Long text should still be included
      expect(userMessage.content).toContain('This is a very long message.');
      expect(userMessage.content.length).toBeGreaterThan(2000);
    });

    it('confidence value is formatted as percentage in message', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Test',
        emotion: 'happy',
        confidence: 0.834
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const userMessage = body.messages.find(m => m.role === 'user');
      
      // Confidence should be formatted as percentage
      expect(userMessage.content).toContain('83%');
    });

    it('special characters in text don\'t break the request', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "I understand." }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      const specialText = 'I feel "stressed" & worried... Can\'t escape! 😰';

      const result = await generateResponse({
        text: specialText,
        emotion: 'stressed',
        confidence: 0.8
      });

      expect(result).toBeDefined();
      expect(result.reply).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const userMessage = body.messages.find(m => m.role === 'user');
      
      // Special chars should be preserved
      expect(userMessage.content).toContain('"stressed"');
      expect(userMessage.content).toContain('&');
      expect(userMessage.content).toContain('Can\'t');
    });

    it('handles 0 confidence value', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Test',
        emotion: 'neutral',
        confidence: 0
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const userMessage = body.messages.find(m => m.role === 'user');
      
      // Confidence 0 is below 0.4 threshold — no tone metadata at all
      expect(userMessage.content).not.toContain('[Voice tone');
      expect(userMessage.content).toContain('User: Test');
    });

    it('handles 1.0 confidence value', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: "Response" }
          }]
        })
      });

      const { configure, generateResponse } = await import('../src/js/conversation-engine.js');
      
      configure({ apiKey: 'sk-test-key' });

      await generateResponse({
        text: 'Test',
        emotion: 'happy',
        confidence: 1.0
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const userMessage = body.messages.find(m => m.role === 'user');
      
      // High confidence (1.0) — tone included as secondary signal
      expect(userMessage.content).toContain('confidence: 100%');
      expect(userMessage.content).toContain('[Voice tone hint: "happy"');
    });
  });

  // ── Provider Presets Tests ─────────────────────────

  describe('PROVIDERS constant', () => {

    it('has openai, groq, and custom keys', async () => {
      const { PROVIDERS } = await import('../src/js/conversation-engine.js');

      expect(PROVIDERS).toHaveProperty('openai');
      expect(PROVIDERS).toHaveProperty('groq');
      expect(PROVIDERS).toHaveProperty('custom');
    });

    it('each provider has name, endpoint, model, placeholder', async () => {
      const { PROVIDERS } = await import('../src/js/conversation-engine.js');

      for (const key of ['openai', 'groq', 'custom']) {
        expect(PROVIDERS[key]).toHaveProperty('name');
        expect(PROVIDERS[key]).toHaveProperty('endpoint');
        expect(PROVIDERS[key]).toHaveProperty('model');
        expect(PROVIDERS[key]).toHaveProperty('placeholder');
      }
    });

    it('openai preset has correct endpoint', async () => {
      const { PROVIDERS } = await import('../src/js/conversation-engine.js');

      expect(PROVIDERS.openai.endpoint).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('groq preset has correct endpoint', async () => {
      const { PROVIDERS } = await import('../src/js/conversation-engine.js');

      expect(PROVIDERS.groq.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    it('custom preset has empty endpoint and model', async () => {
      const { PROVIDERS } = await import('../src/js/conversation-engine.js');

      expect(PROVIDERS.custom.endpoint).toBe('');
      expect(PROVIDERS.custom.model).toBe('');
    });
  });

  describe('setProvider()', () => {

    it('setProvider changes endpoint and model for openai', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      const { configure, setProvider, generateResponse } = await import('../src/js/conversation-engine.js');

      configure({ apiKey: 'sk-test-key' });
      setProvider('openai');

      await generateResponse({ text: 'Hi', emotion: 'neutral', confidence: 0.5 });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('gpt-4o-mini');
    });

    it('setProvider changes endpoint and model for groq', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      const { configure, setProvider, generateResponse } = await import('../src/js/conversation-engine.js');

      configure({ apiKey: 'gsk-test-key' });
      setProvider('groq');

      await generateResponse({ text: 'Hi', emotion: 'neutral', confidence: 0.5 });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('llama-3.1-8b-instant');
    });

    it('setProvider does NOT overwrite the API key', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      const { configure, setProvider, generateResponse, isConfigured } = await import('../src/js/conversation-engine.js');

      configure({ apiKey: 'my-secret-key' });
      setProvider('openai');

      expect(isConfigured()).toBe(true);

      await generateResponse({ text: 'Hi', emotion: 'neutral', confidence: 0.5 });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe('Bearer my-secret-key');
    });

    it('setProvider ignores unknown provider names', async () => {
      const { setProvider, getProvider } = await import('../src/js/conversation-engine.js');

      const before = getProvider();
      setProvider('nonexistent');
      expect(getProvider()).toBe(before);
    });
  });

  describe('getProvider()', () => {

    it('returns the default provider', async () => {
      const { getProvider } = await import('../src/js/conversation-engine.js');

      expect(getProvider()).toBe('groq');
    });

    it('returns updated provider after setProvider', async () => {
      const { setProvider, getProvider } = await import('../src/js/conversation-engine.js');

      setProvider('openai');
      expect(getProvider()).toBe('openai');
    });
  });

  describe('getProviders()', () => {

    it('returns an object with all provider keys', async () => {
      const { getProviders } = await import('../src/js/conversation-engine.js');

      const providers = getProviders();
      expect(Object.keys(providers)).toEqual(expect.arrayContaining(['openai', 'groq', 'custom']));
    });

    it('returns a copy (not the original object)', async () => {
      const { getProviders, PROVIDERS } = await import('../src/js/conversation-engine.js');

      const copy = getProviders();
      copy.openai = 'modified';
      expect(PROVIDERS.openai).not.toBe('modified');
    });
  });
});
