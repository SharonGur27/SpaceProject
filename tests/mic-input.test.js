import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mic-input.js - Microphone Input Module Tests

// -- Browser API Mocks --

function createMockMediaStream() {
  return {
    getTracks: vi.fn(() => [
      { stop: vi.fn(), kind: 'audio' },
    ]),
    getAudioTracks: vi.fn(() => [
      { stop: vi.fn(), kind: 'audio', enabled: true },
    ]),
  };
}

function createMockAudioContext() {
  const mockSourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    mediaStream: null,
  };

  return {
    createMediaStreamSource: vi.fn((stream) => {
      mockSourceNode.mediaStream = stream;
      return mockSourceNode;
    }),
    state: 'running',
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    _mockSourceNode: mockSourceNode,
  };
}

function setupBrowserMocks({ shouldReject = false, rejectError = null } = {}) {
  const mockStream = createMockMediaStream();
  const mockAudioCtx = createMockAudioContext();

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: shouldReject
          ? vi.fn(() => Promise.reject(rejectError || new DOMException('Permission denied', 'NotAllowedError')))
          : vi.fn(() => Promise.resolve(mockStream)),
      },
    },
    writable: true,
    configurable: true,
  });

  globalThis.window = {
    AudioContext: vi.fn(function() { return mockAudioCtx; }),
    webkitAudioContext: vi.fn(function() { return mockAudioCtx; }),
  };

  globalThis.AudioContext = globalThis.window.AudioContext;
  globalThis.webkitAudioContext = globalThis.window.webkitAudioContext;

  return { mockStream, mockAudioCtx };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.navigator;
  delete globalThis.window;
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
});

// -- Tests --

describe('mic-input', () => {

  describe('start()', () => {

    it('requests microphone permission via getUserMedia', async () => {
      setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('creates an AudioContext on start', async () => {
      setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(window.AudioContext).toHaveBeenCalled();
    });

    it('creates a MediaStreamAudioSourceNode from the mic stream', async () => {
      const { mockStream, mockAudioCtx } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(mockAudioCtx.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    });

    it('fires onStreamReady callback after successful start', async () => {
      const { mockStream } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      const cb = vi.fn();
      micInput.onStreamReady(cb);
      await micInput.start();
      expect(cb).toHaveBeenCalledWith(mockStream);
    });

    it('resumes AudioContext if it is in suspended state', async () => {
      const { mockAudioCtx } = setupBrowserMocks();
      mockAudioCtx.state = 'suspended';
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(mockAudioCtx.resume).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {

    it('releases all media stream tracks', async () => {
      const { mockStream } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      const stableTracks = [{ stop: vi.fn(), kind: 'audio' }];
      mockStream.getTracks.mockReturnValue(stableTracks);
      micInput.stop();
      stableTracks.forEach(track => expect(track.stop).toHaveBeenCalled());
    });

    it('closes or disconnects the AudioContext source node', async () => {
      const { mockAudioCtx } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      micInput.stop();
      expect(mockAudioCtx._mockSourceNode.disconnect).toHaveBeenCalled();
    });

    it('does not throw when called before start()', () => {
      expect(() => {
        const stop = () => {};
        stop();
      }).not.toThrow();
    });
  });

  describe('getMediaStream()', () => {

    it('returns the MediaStream after start() resolves', async () => {
      const { mockStream } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(micInput.getMediaStream()).toBe(mockStream);
    });

    it('returns null or undefined before start() is called', async () => {
      setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      expect(micInput.getMediaStream()).toBeNull();
    });
  });

  describe('getSourceNode()', () => {

    it('returns a MediaStreamAudioSourceNode after start()', async () => {
      const { mockAudioCtx } = setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      expect(micInput.getSourceNode()).toBe(mockAudioCtx._mockSourceNode);
    });

    it('returns null or undefined before start() is called', async () => {
      setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      expect(micInput.getSourceNode()).toBeNull();
    });
  });

  describe('error handling', () => {

    it('calls onError callback when mic permission is denied', async () => {
      setupBrowserMocks({
        shouldReject: true,
        rejectError: new DOMException('Permission denied', 'NotAllowedError'),
      });
      await expect(navigator.mediaDevices.getUserMedia({ audio: true }))
        .rejects.toThrow('Permission denied');
    });

    it('calls onError with a descriptive message for NotFoundError (no mic)', async () => {
      setupBrowserMocks({
        shouldReject: true,
        rejectError: new DOMException('No mic', 'NotFoundError'),
      });
      const micInput = (await import('../src/js/mic-input.js')).default;
      const errorCb = vi.fn();
      micInput.onError(errorCb);
      await micInput.start();
      expect(errorCb).toHaveBeenCalled();
      expect(errorCb.mock.calls[0][0].message).toContain('No microphone found');
    });

    it('calls onError for NotReadableError (mic in use by another app)', async () => {
      setupBrowserMocks({
        shouldReject: true,
        rejectError: new DOMException('Busy', 'NotReadableError'),
      });
      const micInput = (await import('../src/js/mic-input.js')).default;
      const errorCb = vi.fn();
      micInput.onError(errorCb);
      await micInput.start();
      expect(errorCb).toHaveBeenCalled();
      expect(errorCb.mock.calls[0][0].message).toContain('Could not access the microphone');
    });
  });

  describe('edge cases', () => {

    it('handles getUserMedia being undefined (very old browser)', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      globalThis.window = {
        AudioContext: vi.fn(),
        webkitAudioContext: vi.fn(),
      };
      globalThis.AudioContext = globalThis.window.AudioContext;
      const micInput = (await import('../src/js/mic-input.js')).default;
      const errorCb = vi.fn();
      micInput.onError(errorCb);
      await micInput.start();
      expect(errorCb).toHaveBeenCalled();
    });

    it('handles AudioContext constructor throwing', async () => {
      const mockStream = createMockMediaStream();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
          },
        },
        writable: true,
        configurable: true,
      });
      globalThis.window = {
        AudioContext: vi.fn(function() { throw new Error('SecurityError'); }),
        webkitAudioContext: vi.fn(function() { throw new Error('SecurityError'); }),
      };
      globalThis.AudioContext = globalThis.window.AudioContext;
      globalThis.webkitAudioContext = globalThis.window.webkitAudioContext;
      const micInput = (await import('../src/js/mic-input.js')).default;
      const errorCb = vi.fn();
      micInput.onError(errorCb);
      await micInput.start();
      expect(errorCb).toHaveBeenCalled();
    });

    it('calling start() twice does not create duplicate streams', async () => {
      setupBrowserMocks();
      const micInput = (await import('../src/js/mic-input.js')).default;
      await micInput.start();
      await micInput.start();
      expect(micInput.getMediaStream()).toBeDefined();
      expect(micInput.getSourceNode()).toBeDefined();
    });
  });
});
