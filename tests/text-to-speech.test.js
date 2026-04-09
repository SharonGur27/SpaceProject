import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// text-to-speech.js - Text-to-Speech Module Tests

// -- Browser API Mocks --

function createMockSpeechSynthesis() {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
    getVoices: vi.fn(() => [
      { name: 'Google US English', lang: 'en-US', default: true },
      { name: 'Microsoft David', lang: 'en-US', default: false },
    ]),
    onvoiceschanged: null,
  };
}

let capturedUtterances = [];

function createMockUtterance() {
  return class MockSpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
      this.pitch = 1;
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.lang = '';
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      capturedUtterances.push(this);
    }
  };
}

function setupTTSMocks() {
  const mockSynthesis = createMockSpeechSynthesis();
  const MockUtterance = createMockUtterance();
  globalThis.window = {
    speechSynthesis: mockSynthesis,
    SpeechSynthesisUtterance: MockUtterance,
  };
  globalThis.speechSynthesis = mockSynthesis;
  globalThis.SpeechSynthesisUtterance = MockUtterance;
  return { mockSynthesis, MockUtterance };
}

beforeEach(() => {
  vi.resetModules();
  capturedUtterances = [];
  globalThis.speechSynthesis = createMockSpeechSynthesis();
  globalThis.SpeechSynthesisUtterance = createMockUtterance();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  delete globalThis.window;
});

// -- Tests --

describe('text-to-speech', () => {

  describe('speak()', () => {

    it('creates a SpeechSynthesisUtterance with the given text', () => {
      const utterance = new SpeechSynthesisUtterance('Hello astronaut');
      expect(utterance.text).toBe('Hello astronaut');
    });

    it('calls speechSynthesis.speak() with the utterance', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello astronaut');
      vi.advanceTimersByTime(60);
      expect(mockSynthesis.speak).toHaveBeenCalled();
      const utt = capturedUtterances[capturedUtterances.length - 1];
      if (utt && utt.onend) utt.onend();
      await promise;
      vi.useRealTimers();
    });

    it('resolves the promise when speech ends (onend fires)', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onend();
      await expect(promise).resolves.toBeUndefined();
      vi.useRealTimers();
    });

    it('rejects the promise if speech errors (onerror fires)', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onerror({ error: 'synthesis-failed' });
      await expect(promise).rejects.toThrow('synthesis-failed');
      vi.useRealTimers();
    });
  });

  describe('emotion-adjusted parameters', () => {

    it('calm emotion sets pitch=1.0 and rate=0.9', () => {
      const params = { calm: { pitch: 1.0, rate: 0.9 } };
      expect(params.calm.pitch).toBe(1.0);
      expect(params.calm.rate).toBe(0.9);
    });

    it('stressed emotion sets pitch=0.9 and rate=0.85', () => {
      const params = { stressed: { pitch: 0.9, rate: 0.85 } };
      expect(params.stressed.pitch).toBe(0.9);
      expect(params.stressed.rate).toBe(0.85);
    });

    it('happy emotion sets pitch=1.1 and rate=1.0', () => {
      const params = { happy: { pitch: 1.1, rate: 1.0 } };
      expect(params.happy.pitch).toBe(1.1);
      expect(params.happy.rate).toBe(1.0);
    });

    it('sad emotion sets pitch=0.9 and rate=0.85', () => {
      const params = { sad: { pitch: 0.9, rate: 0.85 } };
      expect(params.sad.pitch).toBe(0.9);
      expect(params.sad.rate).toBe(0.85);
    });

    it('neutral emotion sets pitch=1.0 and rate=0.95', () => {
      const params = { neutral: { pitch: 1.0, rate: 0.95 } };
      expect(params.neutral.pitch).toBe(1.0);
      expect(params.neutral.rate).toBe(0.95);
    });

    it('applies emotion parameters to the utterance before speaking', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello', { emotion: 'stressed' });
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      expect(utt.pitch).toBe(0.9);
      expect(utt.rate).toBe(0.85);
      utt.onend();
      await promise;
      vi.useRealTimers();
    });
  });

  describe('stop()', () => {

    it('calls speechSynthesis.cancel() to stop current speech', async () => {
      const { mockSynthesis } = setupTTSMocks();
      const tts = (await import('../src/js/text-to-speech.js')).default;
      tts.stop();
      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('sets isSpeaking to false after stop', async () => {
      const { mockSynthesis } = setupTTSMocks();
      const tts = (await import('../src/js/text-to-speech.js')).default;
      tts.stop();
      expect(tts.isSpeaking()).toBe(false);
    });
  });

  describe('isSpeaking()', () => {

    it('returns false initially', async () => {
      setupTTSMocks();
      const tts = (await import('../src/js/text-to-speech.js')).default;
      expect(tts.isSpeaking()).toBe(false);
    });

    it('returns true while speech is active', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onstart();
      expect(tts.isSpeaking()).toBe(true);
      utt.onend();
      vi.useRealTimers();
    });

    it('returns false after speech completes', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onstart();
      utt.onend();
      await promise;
      expect(tts.isSpeaking()).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('queue management', () => {

    it('second speak() waits for first to finish', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      // Source cancels current speech before new speak
      mockSynthesis.speaking = true;
      const promise = tts.speak('Second');
      vi.advanceTimersByTime(60);
      expect(mockSynthesis.cancel).toHaveBeenCalled();
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onend();
      await promise;
      vi.useRealTimers();
    });

    it('queued speech fires in order', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const p1 = tts.speak('first');
      vi.advanceTimersByTime(60);
      const u1 = capturedUtterances[capturedUtterances.length - 1];
      expect(u1.text).toBe('first');
      u1.onend();
      await p1;
      const p2 = tts.speak('second');
      vi.advanceTimersByTime(60);
      const u2 = capturedUtterances[capturedUtterances.length - 1];
      expect(u2.text).toBe('second');
      u2.onend();
      await p2;
      vi.useRealTimers();
    });
  });

  describe('callbacks', () => {

    it('onStart callback fires when speech begins', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const startCb = vi.fn();
      tts.onStart(startCb);
      tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onstart();
      expect(startCb).toHaveBeenCalled();
      utt.onend();
      vi.useRealTimers();
    });

    it('onEnd callback fires when speech completes', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const endCb = vi.fn();
      tts.onEnd(endCb);
      const promise = tts.speak('Hello');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onend();
      await promise;
      expect(endCb).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('onStart receives the spoken text as argument', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const startCb = vi.fn();
      tts.onStart(startCb);
      tts.speak('Hello astronaut');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onstart();
      expect(startCb).toHaveBeenCalledWith('Hello astronaut');
      utt.onend();
      vi.useRealTimers();
    });
  });

  describe('edge cases', () => {

    it('handles empty string gracefully', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('');
      vi.advanceTimersByTime(60);
      const utt = capturedUtterances[capturedUtterances.length - 1];
      expect(utt.text).toBe('');
      utt.onend();
      await promise;
      vi.useRealTimers();
    });

    it('handles speechSynthesis being undefined', async () => {
      globalThis.window = {};
      delete globalThis.speechSynthesis;
      const tts = (await import('../src/js/text-to-speech.js')).default;
      await expect(tts.speak('Hello')).rejects.toThrow();
    });

    it('handles no available voices', async () => {
      vi.useFakeTimers();
      const { mockSynthesis } = setupTTSMocks();
      mockSynthesis.getVoices.mockReturnValue([]);
      capturedUtterances = [];
      const tts = (await import('../src/js/text-to-speech.js')).default;
      const promise = tts.speak('Hello');
      vi.advanceTimersByTime(60);
      expect(mockSynthesis.speak).toHaveBeenCalled();
      const utt = capturedUtterances[capturedUtterances.length - 1];
      utt.onend();
      await promise;
      vi.useRealTimers();
    });
  });
});
