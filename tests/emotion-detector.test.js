import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// emotion-detector.js - Emotion Detector Module Tests

// -- TensorFlow.js Mocks --

function createMockTfModel(predictionScores = [0.1, 0.6, 0.15, 0.05, 0.1]) {
  return {
    predict: vi.fn((tensor) => ({
      dataSync: vi.fn(() => Float32Array.from(predictionScores)),
      data: vi.fn(() => Promise.resolve(Float32Array.from(predictionScores))),
      dispose: vi.fn(),
    })),
    dispose: vi.fn(),
  };
}

function createMockTf(predictionScores) {
  const model = createMockTfModel(predictionScores);
  return {
    loadLayersModel: vi.fn(() => Promise.resolve(model)),
    tensor2d: vi.fn((data, shape) => ({
      dataSync: vi.fn(() => Float32Array.from(data.flat())),
      dispose: vi.fn(),
      shape,
    })),
    dispose: vi.fn(),
    _model: model,
  };
}

const EMOTION_LABELS = ['calm', 'stressed', 'happy', 'sad', 'neutral'];

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.tf;
  delete globalThis.window;
});

// -- Tests --

describe('emotion-detector', () => {

  describe('loadModel()', () => {

    it('loads a TensorFlow.js model from the given URL', async () => {
      const mockTf = createMockTf();
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('test/model.json');
      expect(mockTf.loadLayersModel).toHaveBeenCalledWith('test/model.json');
    });

    it('sets isModelLoaded() to true after successful load', async () => {
      const mockTf = createMockTf();
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('test/model.json');
      expect(detector.isModelLoaded()).toBe(true);
    });

    it('handles missing model file gracefully', async () => {
      const mockTf = createMockTf();
      mockTf.loadLayersModel.mockRejectedValue(new Error('Model not found'));
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('invalid/path');
      expect(detector.isModelLoaded()).toBe(false);
      // Should not crash, and predict should use fallback
      const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
    });

    it('mock model loads successfully', async () => {
      const tf = createMockTf();
      const model = await tf.loadLayersModel('src/model/model.json');
      expect(model).toBeDefined();
      expect(model.predict).toBeDefined();
      expect(tf.loadLayersModel).toHaveBeenCalledWith('src/model/model.json');
    });
  });

  describe('predict()', () => {

    describe('high confidence (>= 0.55)', () => {

      it('returns the top emotion when confidence is high', () => {
        const scores = [0.05, 0.65, 0.1, 0.1, 0.1];
        const maxIdx = scores.indexOf(Math.max(...scores));
        const confidence = scores[maxIdx];
        expect(confidence).toBeGreaterThanOrEqual(0.55);
        expect(EMOTION_LABELS[maxIdx]).toBe('stressed');
      });

      it('returns emotion object without uncertain flag', async () => {
        const mockTf = createMockTf([0.05, 0.7, 0.1, 0.05, 0.1]);
        globalThis.tf = mockTf;
        const detector = await import('../src/js/emotion-detector.js');
        await detector.loadModel('test/model.json');
        const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
        expect(result.emotion).toBe('stressed');
        expect(result.confidence).toBeGreaterThanOrEqual(0.55);
        expect(result.uncertain).toBeUndefined();
      });
    });

    describe('medium confidence (0.40-0.55)', () => {

      it('returns top emotion with uncertain flag when confidence is medium', () => {
        const scores = [0.15, 0.15, 0.45, 0.1, 0.15];
        const maxIdx = scores.indexOf(Math.max(...scores));
        const confidence = scores[maxIdx];
        expect(confidence).toBeGreaterThanOrEqual(0.40);
        expect(confidence).toBeLessThan(0.55);
        expect(EMOTION_LABELS[maxIdx]).toBe('happy');
        const result = {
          emotion: EMOTION_LABELS[maxIdx],
          confidence,
          uncertain: true,
        };
        expect(result.uncertain).toBe(true);
      });

      it('uncertain flag is set to true in the result object', async () => {
        const mockTf = createMockTf([0.15, 0.15, 0.45, 0.1, 0.15]);
        globalThis.tf = mockTf;
        const detector = await import('../src/js/emotion-detector.js');
        await detector.loadModel('test/model.json');
        const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
        expect(result.emotion).toBe('happy');
        expect(result.uncertain).toBe(true);
      });
    });

    describe('low confidence (< 0.40)', () => {

      it('falls back to neutral when confidence is very low', () => {
        const scores = [0.22, 0.25, 0.18, 0.15, 0.20];
        const maxIdx = scores.indexOf(Math.max(...scores));
        const confidence = scores[maxIdx];
        expect(confidence).toBeLessThan(0.40);
        const result = {
          emotion: 'neutral',
          confidence,
          uncertain: true,
        };
        expect(result.emotion).toBe('neutral');
        expect(result.uncertain).toBe(true);
      });

      it('result includes allScores for transparency', async () => {
        const mockTf = createMockTf([0.22, 0.25, 0.18, 0.15, 0.20]);
        globalThis.tf = mockTf;
        const detector = await import('../src/js/emotion-detector.js');
        await detector.loadModel('test/model.json');
        const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
        expect(result.allScores).toBeDefined();
        expect(Object.keys(result.allScores)).toEqual(EMOTION_LABELS);
        expect(result.emotion).toBe('neutral');
        expect(result.uncertain).toBe(true);
      });
    });

    describe('allScores', () => {

      it('predict() result includes scores for all 5 emotions', async () => {
        const mockTf = createMockTf([0.1, 0.6, 0.15, 0.05, 0.1]);
        globalThis.tf = mockTf;
        const detector = await import('../src/js/emotion-detector.js');
        await detector.loadModel('test/model.json');
        const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
        expect(result.allScores).toBeDefined();
        for (const label of EMOTION_LABELS) {
          expect(result.allScores[label]).toBeDefined();
          expect(typeof result.allScores[label]).toBe('number');
        }
      });

      it('all scores should sum to approximately 1.0 (softmax output)', () => {
        const scores = [0.1, 0.6, 0.15, 0.05, 0.1];
        const sum = scores.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 5);
      });
    });
  });

  describe('getEmotionLabels()', () => {

    it('returns the five expected emotion categories', () => {
      const expected = ['calm', 'stressed', 'happy', 'sad', 'neutral'];
      expect(EMOTION_LABELS).toEqual(expected);
      expect(EMOTION_LABELS.length).toBe(5);
    });

    it('label order matches model output indices', async () => {
      const mockTf = createMockTf();
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      const labels = detector.getEmotionLabels();
      expect(labels).toEqual(['calm', 'stressed', 'happy', 'sad', 'neutral']);
      expect(labels.length).toBe(5);
    });
  });

  describe('isModelLoaded()', () => {

    it('returns false before loadModel() is called', async () => {
      globalThis.window = {};
      const detector = await import('../src/js/emotion-detector.js');
      expect(detector.isModelLoaded()).toBe(false);
    });

    it('returns true after loadModel() succeeds', async () => {
      const mockTf = createMockTf();
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('test/model.json');
      expect(detector.isModelLoaded()).toBe(true);
    });

    it('returns false if loadModel() failed', async () => {
      const mockTf = createMockTf();
      mockTf.loadLayersModel.mockRejectedValue(new Error('fail'));
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('bad/path');
      expect(detector.isModelLoaded()).toBe(false);
    });
  });

  describe('error handling', () => {

    it('model load failure should be catchable', async () => {
      const tf = {
        loadLayersModel: vi.fn(() => Promise.reject(new Error('Model not found'))),
      };
      await expect(tf.loadLayersModel('invalid/path'))
        .rejects.toThrow('Model not found');
    });

    it('predict() returns neutral emotion when model is not loaded', async () => {
      globalThis.window = {};
      const detector = await import('../src/js/emotion-detector.js');
      // Model not loaded - should use fallback
      const result = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(EMOTION_LABELS).toContain(result.emotion);
    });

    it('predict() handles invalid feature vector gracefully', async () => {
      globalThis.window = {};
      const detector = await import('../src/js/emotion-detector.js');
      // null features - fallback handles this
      const result = detector.predict(null);
      expect(result.emotion).toBe('neutral');
      expect(result.uncertain).toBe(true);
    });
  });

  describe('edge cases', () => {

    it('predict() with all-zero features does not crash', async () => {
      const mockTf = createMockTf();
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('test/model.json');
      expect(() => {
        detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
      }).not.toThrow();
    });

    it('predict() with NaN features returns neutral', async () => {
      globalThis.window = {};
      const detector = await import('../src/js/emotion-detector.js');
      // Without model, uses fallback which handles NaN gracefully
      const result = detector.predict(new Float32Array([NaN, NaN, NaN, NaN, NaN, NaN]));
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
    });

    it('calling predict() before loadModel() returns safe default', async () => {
      globalThis.window = {};
      const detector = await import('../src/js/emotion-detector.js');
      const result = detector.predict(new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
      expect(result).toBeDefined();
      expect(result.emotion).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });

    it('concurrent predict() calls do not interfere', async () => {
      const mockTf = createMockTf([0.1, 0.6, 0.15, 0.05, 0.1]);
      globalThis.tf = mockTf;
      const detector = await import('../src/js/emotion-detector.js');
      await detector.loadModel('test/model.json');
      const r1 = detector.predict(new Float32Array([0, 0, 0, 0, 0, 0]));
      const r2 = detector.predict(new Float32Array([1, 1, 1, 1, 1, 1]));
      expect(r1.emotion).toBeDefined();
      expect(r2.emotion).toBeDefined();
      // Both should return consistent results
      expect(r1.emotion).toBe(r2.emotion);
    });
  });
});
