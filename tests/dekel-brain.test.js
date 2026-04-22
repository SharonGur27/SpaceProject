import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────
// dekel-brain.js — Response Generator Tests
//
// Interface under test:
//   generateResponse({ text, emotion, confidence }) → { reply, emotion }
//
// Confidence thresholds (from implementation):
//   HIGH: >= 0.65
//   MEDIUM: >= 0.45
//   LOW: < 0.45
//
// Expected emotions: ['calm', 'stressed', 'happy', 'sad', 'neutral']
// ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────

describe('dekel-brain', () => {

  describe('generateResponse()', () => {

    it('returns object with reply and emotion', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'I feel overwhelmed',
        emotion: 'stressed',
        confidence: 0.8
      });

      expect(result).toBeDefined();
      expect(result.reply).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(typeof result.reply).toBe('string');
      expect(typeof result.emotion).toBe('string');
    });

    it('reply is a non-empty string', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.7
      });

      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('reply is reasonable length (< 300 chars)', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Test',
        emotion: 'calm',
        confidence: 0.8
      });

      expect(result.reply.length).toBeLessThan(300);
    });
  });

  describe('high-confidence responses', () => {

    it('high-confidence stressed → supportive acknowledgment', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Everything is too much right now',
        emotion: 'stressed',
        confidence: 0.75
      });

      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(10);
      // Should contain supportive language
      const supportiveWords = ['hear', 'breath', 'listen', 'here', 'stressed', 'tension', 'pressure', 'challenging'];
      const hasSupport = supportiveWords.some(word => result.reply.toLowerCase().includes(word));
      expect(hasSupport).toBe(true);
    });

    it('high-confidence happy → warm response', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'I accomplished my goals today!',
        emotion: 'happy',
        confidence: 0.80
      });

      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(10);
      // Should reflect positive engagement
      const positiveWords = ['great', 'wonderful', 'love', 'fantastic', 'energy', 'joy', 'good'];
      const hasPositive = positiveWords.some(word => result.reply.toLowerCase().includes(word));
      expect(hasPositive).toBe(true);
    });

    it('high-confidence calm → relaxed response', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'I feel peaceful right now',
        emotion: 'calm',
        confidence: 0.85
      });

      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(10);
      // Should acknowledge the calm state
      const calmWords = ['relaxed', 'peaceful', 'centered', 'calm', 'balance', 'steady', 'glad'];
      const hasCalm = calmWords.some(word => result.reply.toLowerCase().includes(word));
      expect(hasCalm).toBe(true);
    });

    it('high-confidence sad → empathetic response', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'I miss my family',
        emotion: 'sad',
        confidence: 0.78
      });

      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(10);
      // Should show empathy
      const empatheticWords = ['hear', 'listen', 'here', 'tough', 'sadness', 'weighing', 'down'];
      const hasEmpathy = empatheticWords.some(word => result.reply.toLowerCase().includes(word));
      expect(hasEmpathy).toBe(true);
    });
  });

  describe('low-confidence responses', () => {

    it('low-confidence any emotion → gentle check-in question', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Things are okay I guess',
        emotion: 'neutral',
        confidence: 0.30
      });

      expect(result.reply).toBeDefined();
      expect(result.emotion).toBe('neutral');
      // Should ask for clarification
      expect(result.reply).toMatch(/\?$/); // Ends with question mark
    });

    it('low-confidence returns neutral emotion', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Test',
        emotion: 'stressed',
        confidence: 0.35
      });

      expect(result.emotion).toBe('neutral');
    });

    it('low-confidence response asks for clarification', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Hmm',
        emotion: 'happy',
        confidence: 0.25
      });

      const clarifyingWords = ['understand', 'tell me more', 'how are you', 'feeling', 'help me', 'here to listen', 'on your mind', 'here for you'];
      const hasClarification = clarifyingWords.some(phrase => result.reply.toLowerCase().includes(phrase));
      expect(hasClarification).toBe(true);
    });
  });

  describe('neutral emotion handling', () => {

    it('neutral emotion produces appropriate response', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Just checking in',
        emotion: 'neutral',
        confidence: 0.70
      });

      expect(result.reply).toBeDefined();
      expect(result.emotion).toBe('calm');
    });

    it('neutral response is open-ended', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Hello',
        emotion: 'neutral',
        confidence: 0.65
      });

      // Neutral responses should invite conversation
      const openWords = ['listen', 'talk', 'mind', 'discuss', 'happening'];
      const hasOpen = openWords.some(word => result.reply.toLowerCase().includes(word));
      expect(hasOpen).toBe(true);
    });
  });

  describe('response variability', () => {

    it('all emotions produce unique responses (not the same text)', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const emotions = ['calm', 'stressed', 'happy', 'sad', 'neutral'];
      const responses = await Promise.all(
        emotions.map(emotion =>
          generateResponse({ text: 'Test', emotion, confidence: 0.75 }).then(r => r.reply)
        )
      );

      // Check that we get at least 3 different responses (allowing some overlap due to randomness)
      const uniqueResponses = new Set(responses);
      expect(uniqueResponses.size).toBeGreaterThanOrEqual(3);
    });

    it('repeated calls may produce different responses (randomness)', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const responses = [];
      for (let i = 0; i < 10; i++) {
        const result = await generateResponse({
          text: 'I feel stressed',
          emotion: 'stressed',
          confidence: 0.75
        });
        responses.push(result.reply);
      }

      // With random selection from templates, we should get some variety
      const uniqueResponses = new Set(responses);
      expect(uniqueResponses.size).toBeGreaterThan(1);
    });
  });

  describe('edge cases', () => {

    it('handles missing text gracefully', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        emotion: 'calm',
        confidence: 0.7
      });

      expect(result.reply).toBeDefined();
      expect(result.emotion).toBeDefined();
    });

    it('handles invalid emotion gracefully', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Test',
        emotion: 'unknown',
        confidence: 0.7
      });

      expect(result.reply).toBeDefined();
      expect(result.emotion).toBeDefined();
    });

    it('handles edge confidence values (0, 1)', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result1 = await generateResponse({
        text: 'Test',
        emotion: 'calm',
        confidence: 0
      });

      const result2 = await generateResponse({
        text: 'Test',
        emotion: 'happy',
        confidence: 1.0
      });

      expect(result1.reply).toBeDefined();
      expect(result2.reply).toBeDefined();
    });

    it('Dekel always responds with calm emotion (regulation strategy)', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const emotions = ['stressed', 'happy', 'sad', 'calm', 'neutral'];
      
      for (const emotion of emotions) {
        const result = await generateResponse({
          text: 'Test',
          emotion,
          confidence: 0.75
        });

        // Dekel responds calmly to help regulate the user's emotion
        expect(result.emotion).toBe('calm');
      }
    });
  });

  // ── New Tests for Async + Fallback Behavior ─────────

  describe('async interface', () => {

    it('generateResponse returns a Promise', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = generateResponse({
        text: 'Test',
        emotion: 'neutral',
        confidence: 0.7
      });

      expect(result).toBeInstanceOf(Promise);
    });

    it('Promise resolves to { reply, emotion } object', async () => {
      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'Test',
        emotion: 'calm',
        confidence: 0.8
      });

      expect(result).toHaveProperty('reply');
      expect(result).toHaveProperty('emotion');
      expect(typeof result.reply).toBe('string');
      expect(typeof result.emotion).toBe('string');
    });
  });

  describe('fallback behavior', () => {

    it('when engine is NOT configured, returns template-based response', async () => {
      // Reset modules to ensure clean state
      vi.resetModules();

      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const result = await generateResponse({
        text: 'I feel stressed',
        emotion: 'stressed',
        confidence: 0.75
      });

      // Should still get a valid response
      expect(result).toBeDefined();
      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(0);
      expect(result.emotion).toBe('calm');
    });

    it('template-based fallback works for all emotions', async () => {
      vi.resetModules();

      const { generateResponse } = await import('../src/js/dekel-brain.js');

      const emotions = ['calm', 'stressed', 'happy', 'sad', 'neutral'];
      
      for (const emotion of emotions) {
        const result = await generateResponse({
          text: 'Test message',
          emotion,
          confidence: 0.7
        });

        expect(result.reply).toBeDefined();
        expect(result.reply.length).toBeGreaterThan(0);
        expect(result.emotion).toBe('calm');
      }
    });
  });

  describe('generateFallbackResponse (new export)', () => {

    it('generateFallbackResponse is exported', async () => {
      const module = await import('../src/js/dekel-brain.js');
      
      expect(module.generateFallbackResponse).toBeDefined();
      expect(typeof module.generateFallbackResponse).toBe('function');
    });

    it('generateFallbackResponse is synchronous (not a Promise)', async () => {
      const { generateFallbackResponse } = await import('../src/js/dekel-brain.js');

      const result = generateFallbackResponse({
        text: 'Test',
        emotion: 'neutral',
        confidence: 0.7
      });

      // Should NOT be a Promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toHaveProperty('reply');
      expect(result).toHaveProperty('emotion');
    });

    it('generateFallbackResponse returns template-based responses', async () => {
      const { generateFallbackResponse } = await import('../src/js/dekel-brain.js');

      const result = generateFallbackResponse({
        text: 'I feel stressed',
        emotion: 'stressed',
        confidence: 0.8
      });

      expect(result.reply).toBeDefined();
      expect(result.reply.length).toBeGreaterThan(0);
      expect(result.emotion).toBe('calm');
    });

    it('generateFallbackResponse handles all emotions correctly', async () => {
      const { generateFallbackResponse } = await import('../src/js/dekel-brain.js');

      const emotions = ['calm', 'stressed', 'happy', 'sad', 'neutral'];
      
      for (const emotion of emotions) {
        const result = generateFallbackResponse({
          text: 'Test',
          emotion,
          confidence: 0.75
        });

        expect(result.reply).toBeDefined();
        expect(result.reply.length).toBeGreaterThan(0);
      }
    });

    it('generateFallbackResponse handles low confidence', async () => {
      const { generateFallbackResponse } = await import('../src/js/dekel-brain.js');

      const result = generateFallbackResponse({
        text: 'Hmm',
        emotion: 'neutral',
        confidence: 0.3
      });

      expect(result.reply).toBeDefined();
      expect(result.emotion).toBe('neutral');
      // Should ask for clarification
      expect(result.reply).toMatch(/\?$/);
    });

    it('generateFallbackResponse confidence thresholds match original behavior', async () => {
      const { generateFallbackResponse } = await import('../src/js/dekel-brain.js');

      // High confidence (>= 0.65)
      const highResult = generateFallbackResponse({
        text: 'Test',
        emotion: 'stressed',
        confidence: 0.75
      });

      // Medium confidence (0.45 - 0.64)
      const medResult = generateFallbackResponse({
        text: 'Test',
        emotion: 'stressed',
        confidence: 0.55
      });

      // Low confidence (< 0.45)
      const lowResult = generateFallbackResponse({
        text: 'Test',
        emotion: 'stressed',
        confidence: 0.3
      });

      // All should produce valid responses
      expect(highResult.reply).toBeDefined();
      expect(medResult.reply).toBeDefined();
      expect(lowResult.reply).toBeDefined();
      
      // Low confidence should return neutral
      expect(lowResult.emotion).toBe('neutral');
    });
  });
});
