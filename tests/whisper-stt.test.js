import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

let mockLocalStorage;

function setupMocks(opts = {}) {
  const { apiKey = 'gsk_test123', mimeSupported = true } = opts;

  // localStorage mock
  mockLocalStorage = {};
  if (apiKey) mockLocalStorage['dekel-api-key'] = apiKey;

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => mockLocalStorage[key] || null),
    setItem: vi.fn((key, val) => { mockLocalStorage[key] = val; }),
    removeItem: vi.fn((key) => { delete mockLocalStorage[key]; })
  });

  // MediaRecorder mock
  const mockRecorderInstance = {
    start: vi.fn(),
    stop: vi.fn(function() {
      // Simulate onstop being called asynchronously
      setTimeout(() => {
        if (this.onstop) this.onstop();
      }, 0);
    }),
    ondataavailable: null,
    onstop: null,
    onerror: null,
    mimeType: 'audio/webm;codecs=opus'
  };

  const MockMediaRecorder = vi.fn(function() {
    Object.assign(this, {
      start: mockRecorderInstance.start,
      stop: function() {
        const self = this;
        setTimeout(() => {
          if (self.onstop) self.onstop();
        }, 0);
      },
      ondataavailable: null,
      onstop: null,
      onerror: null,
      mimeType: 'audio/webm;codecs=opus'
    });
  });

  MockMediaRecorder.isTypeSupported = vi.fn(() => mimeSupported);

  vi.stubGlobal('MediaRecorder', MockMediaRecorder);

  // fetch mock
  vi.stubGlobal('fetch', vi.fn());

  // FormData mock
  const formEntries = [];
  vi.stubGlobal('FormData', vi.fn(function() {
    this._entries = [];
    this.append = vi.fn((key, value, filename) => {
      this._entries.push({ key, value, filename });
      formEntries.push({ key, value, filename });
    });
  }));

  // Blob mock (Vitest provides one, but ensure it works)
  if (typeof Blob === 'undefined') {
    vi.stubGlobal('Blob', vi.fn(function(parts, opts) {
      this.size = parts.reduce((s, p) => s + (p.size || 0), 0);
      this.type = opts?.type || '';
    }));
  }

  return { mockRecorderInstance, MockMediaRecorder, formEntries };
}

function createMockStream() {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    getAudioTracks: vi.fn(() => [{}])
  };
}

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('whisper-stt', () => {

  describe('isSupported()', () => {
    it('returns true when MediaRecorder exists and API key is set', async () => {
      setupMocks({ apiKey: 'gsk_test' });
      const mod = await import('../src/js/whisper-stt.js');
      expect(mod.isSupported()).toBe(true);
    });

    it('returns false when no API key is stored', async () => {
      setupMocks({ apiKey: null });
      const mod = await import('../src/js/whisper-stt.js');
      expect(mod.isSupported()).toBe(false);
    });

    it('returns false when MediaRecorder is not available', async () => {
      setupMocks({ apiKey: 'gsk_test' });
      vi.stubGlobal('MediaRecorder', undefined);
      const mod = await import('../src/js/whisper-stt.js');
      expect(mod.isSupported()).toBe(false);
    });
  });

  describe('start()', () => {
    it('starts MediaRecorder with the provided stream', async () => {
      const { MockMediaRecorder } = setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const stream = createMockStream();

      mod.start(stream);

      expect(MockMediaRecorder).toHaveBeenCalledTimes(1);
    });

    it('fires error callback when no stream is provided', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      mod.start(null);

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('No microphone stream');
    });

    it('fires error when no supported MIME type', async () => {
      setupMocks({ mimeSupported: false });
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      mod.start(createMockStream());

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('compatible audio format');
    });

    it('ignores duplicate start calls', async () => {
      const { MockMediaRecorder } = setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const stream = createMockStream();

      mod.start(stream);
      mod.start(stream); // second call should be ignored

      expect(MockMediaRecorder).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('resolves immediately if not recording', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');

      // stop without start should be a no-op
      await expect(mod.stop()).resolves.toBeUndefined();
    });

    it('sends audio to Whisper API on stop and fires onFinalResult', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const finalCb = vi.fn();
      mod.onFinalResult(finalCb);

      // Mock successful Whisper response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'Hello from space' })
      });

      const stream = createMockStream();
      mod.start(stream);

      // Simulate data being captured
      const recorderInstance = MediaRecorder.mock.instances[0];
      const fakeChunk = new Blob(['audio-data'], { type: 'audio/webm' });
      recorderInstance.ondataavailable({ data: fakeChunk });

      await mod.stop();

      // Let the async onstop + fetch chain complete
      await new Promise(r => setTimeout(r, 50));

      expect(fetch).toHaveBeenCalledTimes(1);
      const fetchArgs = fetch.mock.calls[0];
      expect(fetchArgs[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
      expect(fetchArgs[1].method).toBe('POST');
      expect(fetchArgs[1].headers.Authorization).toBe('Bearer gsk_test123');

      expect(finalCb).toHaveBeenCalledWith('Hello from space');
    });

    it('fires error callback on API failure', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      });

      const stream = createMockStream();
      mod.start(stream);

      const recorderInstance = MediaRecorder.mock.instances[0];
      recorderInstance.ondataavailable({ data: new Blob(['data'], { type: 'audio/webm' }) });

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('Invalid API key');
    });

    it('fires error callback when no audio chunks captured', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      mod.start(createMockStream());
      // Don't fire ondataavailable — no chunks

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('No audio data');
    });

    it('fires error for empty transcript', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '   ' })
      });

      mod.start(createMockStream());
      const recorderInstance = MediaRecorder.mock.instances[0];
      recorderInstance.ondataavailable({ data: new Blob(['data'], { type: 'audio/webm' }) });

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('empty transcript');
    });

    it('fires error when no API key is configured', async () => {
      setupMocks({ apiKey: null });
      // Need MediaRecorder to exist for start() to work, but isSupported will be false
      // We manually test the transcribe path by having a key initially then removing it
      mockLocalStorage['dekel-api-key'] = 'temp_key';
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      mod.start(createMockStream());

      // Remove key before stop
      delete mockLocalStorage['dekel-api-key'];

      const recorderInstance = MediaRecorder.mock.instances[0];
      recorderInstance.ondataavailable({ data: new Blob(['data'], { type: 'audio/webm' }) });

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('No API key');
    });
  });

  describe('onFinalResult() / onError()', () => {
    it('registers callbacks without error', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');

      expect(() => mod.onFinalResult(() => {})).not.toThrow();
      expect(() => mod.onError(() => {})).not.toThrow();
    });
  });

  describe('FormData construction', () => {
    it('sends correct model and file fields', async () => {
      const { formEntries } = setupMocks();
      const mod = await import('../src/js/whisper-stt.js');

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'test' })
      });

      mod.onFinalResult(() => {});
      mod.start(createMockStream());

      const recorderInstance = MediaRecorder.mock.instances[0];
      recorderInstance.ondataavailable({ data: new Blob(['data'], { type: 'audio/webm' }) });

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      // Check FormData was populated correctly
      const formDataInstance = FormData.mock.instances[0];
      if (formDataInstance) {
        const appendCalls = formDataInstance.append.mock.calls;
        const keys = appendCalls.map(c => c[0]);
        expect(keys).toContain('file');
        expect(keys).toContain('model');
        expect(keys).toContain('language');

        const modelCall = appendCalls.find(c => c[0] === 'model');
        expect(modelCall[1]).toBe('whisper-large-v3-turbo');
      }
    });
  });

  describe('network error handling', () => {
    it('handles fetch network failure gracefully', async () => {
      setupMocks();
      const mod = await import('../src/js/whisper-stt.js');
      const errorCb = vi.fn();
      mod.onError(errorCb);

      fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      mod.start(createMockStream());
      const recorderInstance = MediaRecorder.mock.instances[0];
      recorderInstance.ondataavailable({ data: new Blob(['data'], { type: 'audio/webm' }) });

      await mod.stop();
      await new Promise(r => setTimeout(r, 50));

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(errorCb.mock.calls[0][0].message).toContain('Failed to fetch');
    });
  });
});
