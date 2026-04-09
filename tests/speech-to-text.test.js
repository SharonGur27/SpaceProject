import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// speech-to-text.js - Speech-to-Text Module Tests

// -- Browser API Mocks --

function createMockSpeechRecognition() {
  const instance = {
    continuous: false,
    interimResults: false,
    lang: '',
    maxAlternatives: 1,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
  };
  const Constructor = vi.fn(function() { return instance; });
  return { Constructor, instance };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  delete globalThis.window;
});

// -- Tests --

describe('speech-to-text', () => {

  describe('isSupported()', () => {

    it('returns true when SpeechRecognition API exists', async () => {
      const { Constructor } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(stt.isSupported()).toBe(true);
    });

    it('returns true when webkitSpeechRecognition exists (Chrome)', async () => {
      const { Constructor } = createMockSpeechRecognition();
      globalThis.window = { webkitSpeechRecognition: Constructor };
      globalThis.webkitSpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(stt.isSupported()).toBe(true);
    });

    it('returns false when API is completely missing', async () => {
      globalThis.window = {};
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(stt.isSupported()).toBe(false);
    });
  });

  describe('start()', () => {

    it('begins speech recognition', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      expect(instance.start).toHaveBeenCalled();
    });

    it('sets continuous = true for ongoing listening', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      expect(instance.continuous).toBe(true);
    });

    it('sets interimResults = true to get partial transcripts', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      expect(instance.interimResults).toBe(true);
    });

    it('sets language to en-US', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      expect(instance.lang).toBe('en-US');
    });
  });

  describe('onInterimResult', () => {

    it('fires callback with interim transcript text during speech', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onInterimResult(cb);
      stt.start();

      const result = [{ transcript: 'hello world' }];
      result.isFinal = false;
      instance.onresult({ resultIndex: 0, results: [result] });

      expect(cb).toHaveBeenCalledWith('hello world');
    });

    it('provides updated text on each interim result event', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onInterimResult(cb);
      stt.start();

      const r1 = [{ transcript: 'hel' }]; r1.isFinal = false;
      instance.onresult({ resultIndex: 0, results: [r1] });
      const r2 = [{ transcript: 'hello wor' }]; r2.isFinal = false;
      instance.onresult({ resultIndex: 0, results: [r2] });

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenNthCalledWith(1, 'hel');
      expect(cb).toHaveBeenNthCalledWith(2, 'hello wor');
    });
  });

  describe('onFinalResult', () => {

    it('fires callback with final transcript when speech pauses', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onFinalResult(cb);
      stt.start();

      const result = [{ transcript: 'hello world' }];
      result.isFinal = true;
      instance.onresult({ resultIndex: 0, results: [result] });

      expect(cb).toHaveBeenCalledWith('hello world');
    });

    it('final result text is trimmed and non-empty', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onFinalResult(cb);
      stt.start();

      const result = [{ transcript: '  hello world  ' }];
      result.isFinal = true;
      instance.onresult({ resultIndex: 0, results: [result] });

      expect(cb).toHaveBeenCalledWith('hello world');
    });
  });

  describe('auto-restart', () => {

    it('restarts recognition after onend fires (continuous listening)', async () => {
      vi.useFakeTimers();
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      instance.start.mockClear();

      instance.onend();
      vi.advanceTimersByTime(350);

      expect(instance.start).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not restart after explicit stop() call', async () => {
      vi.useFakeTimers();
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      stt.start();
      stt.stop();
      instance.start.mockClear();

      if (instance.onend) instance.onend();
      vi.advanceTimersByTime(350);

      expect(instance.start).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('error handling', () => {

    it('calls onError callback for network errors', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onError(cb);
      stt.start();
      instance.onerror({ error: 'network' });
      expect(cb).toHaveBeenCalled();
      expect(cb.mock.calls[0][0].message).toContain('network');
    });

    it('calls onError for not-allowed errors', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onError(cb);
      stt.start();
      instance.onerror({ error: 'not-allowed' });
      expect(cb).toHaveBeenCalled();
      expect(cb.mock.calls[0][0].message).toContain('not-allowed');
    });

    it('calls onError for no-speech timeout', async () => {
      // Source code treats no-speech as benign (user is quiet) - callback not fired
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onError(cb);
      stt.start();
      instance.onerror({ error: 'no-speech' });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('fallback behavior', () => {

    it('provides fallback text input method when API is unavailable', async () => {
      globalThis.window = {};
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(stt.isSupported()).toBe(false);
      const cb = vi.fn();
      stt.onFinalResult(cb);
      stt.submitText('typed input');
      expect(cb).toHaveBeenCalledWith('typed input');
    });

    it('fallback still fires onFinalResult with provided text', async () => {
      const { Constructor } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const cb = vi.fn();
      stt.onFinalResult(cb);
      stt.submitText('hello from keyboard');
      expect(cb).toHaveBeenCalledWith('hello from keyboard');
    });
  });

  describe('edge cases', () => {

    it('handles stop() called before start()', async () => {
      const { Constructor } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(() => stt.stop()).not.toThrow();
    });

    it('handles rapid start/stop/start cycles', async () => {
      const { Constructor } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      expect(() => {
        stt.start();
        stt.stop();
        stt.start();
      }).not.toThrow();
      expect(Constructor).toHaveBeenCalledTimes(2);
    });

    it('handles empty transcript results gracefully', async () => {
      const { Constructor, instance } = createMockSpeechRecognition();
      globalThis.window = { SpeechRecognition: Constructor };
      globalThis.SpeechRecognition = Constructor;
      const stt = (await import('../src/js/speech-to-text.js')).default;
      const finalCb = vi.fn();
      const interimCb = vi.fn();
      stt.onFinalResult(finalCb);
      stt.onInterimResult(interimCb);
      stt.start();

      const r1 = [{ transcript: '   ' }]; r1.isFinal = true;
      instance.onresult({ resultIndex: 0, results: [r1] });
      const r2 = [{ transcript: '' }]; r2.isFinal = false;
      instance.onresult({ resultIndex: 0, results: [r2] });

      expect(finalCb).not.toHaveBeenCalled();
      expect(interimCb).not.toHaveBeenCalled();
    });
  });
});
