/**
 * emotion-detector.js — TensorFlow.js model loader & emotion predictor
 *
 * Loads a small MLP model (6 features → 5 emotions) and classifies the
 * speaker's emotional state from prosody features extracted by audio-features.js.
 *
 * Emotion labels: ['calm', 'stressed', 'happy', 'sad', 'neutral']
 *
 * Confidence thresholds (from architecture spec):
 *   ≥ 0.55  → confident prediction
 *   0.40–0.54 → prediction returned but flagged uncertain
 *   < 0.40  → fall back to 'neutral', flagged uncertain
 *
 * If TensorFlow.js fails to load the model, the module gracefully degrades:
 * every call to predict() returns { emotion: 'neutral', confidence: 0, uncertain: true }.
 *
 * @module emotion-detector
 */

import { predictFromFeatures, resetState as resetFallbackState } from './emotion-fallback.js';

// ── Constants ───────────────────────────────────────────────────────────────

const EMOTION_LABELS = Object.freeze(['calm', 'stressed', 'happy', 'sad', 'neutral']);

const CONFIDENCE_HIGH = 0.55;
const CONFIDENCE_LOW  = 0.40;

const DEFAULT_MODEL_URL = '../model/model.json';

// ── State ───────────────────────────────────────────────────────────────────

let model = null;
let modelLoaded = false;
let useFallback = false;  // true when TF model can't load

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load the TensorFlow.js emotion model.
 *
 * @param {string} [modelUrl] — path to model.json (default: ../model/model.json)
 * @returns {Promise<void>}
 */
export async function loadModel(modelUrl) {
  const url = modelUrl || DEFAULT_MODEL_URL;

  try {
    // tf is expected to be available globally (loaded via <script> tag) or
    // imported as an ES module. We reference window.tf for browser usage.
    const tf = _getTf();
    if (!tf) {
      console.warn('[emotion-detector] TensorFlow.js not available — using rule-based fallback');
      useFallback = true;
      modelLoaded = false;
      return;
    }

    model = await tf.loadLayersModel(url);
    modelLoaded = true;
    useFallback = false;
    console.log('[emotion-detector] Model loaded successfully from', url);
  } catch (err) {
    console.warn('[emotion-detector] Failed to load model — using rule-based fallback:', err.message);
    model = null;
    modelLoaded = false;
    useFallback = true;
  }
}

/**
 * Predict emotion from a 6-element feature vector.
 *
 * @param {Float32Array|number[]} features — [pitch, pitchVar, energy, centroid, zcr, speechRate]
 * @returns {{ emotion: string, confidence: number, allScores: Object, uncertain?: boolean }}
 */
export function predict(features) {
  // ── Guard: no model → use rule-based fallback ─────────────────────────
  if (!modelLoaded || useFallback) {
    return predictFromFeatures(features);
  }

  // ── Run inference ─────────────────────────────────────────────────────
  const tf = _getTf();

  // Wrap features in a 2-D tensor: shape [1, 6] (batch of one)
  const inputTensor = tf.tensor2d([Array.from(features)], [1, 6]);

  // model.predict returns a tensor of shape [1, 5] with softmax probabilities
  const outputTensor = model.predict(inputTensor);
  const scores = outputTensor.dataSync(); // Float32Array of length 5

  // Clean up tensors to prevent memory leaks
  inputTensor.dispose();
  outputTensor.dispose();

  return _applyConfidenceLogic(scores);
}

/**
 * @returns {boolean} Whether a TF.js model is loaded and ready.
 */
export function isModelLoaded() {
  return modelLoaded;
}

/**
 * @returns {string[]} The ordered list of emotion labels the model outputs.
 */
export function getEmotionLabels() {
  return [...EMOTION_LABELS];
}

/**
 * Reset temporal state in the fallback classifier (call when starting a new conversation).
 */
export function resetState() {
  resetFallbackState();
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Apply the confidence-threshold logic defined in the architecture:
 *   ≥ 0.55  → return top emotion
 *   0.40-0.54 → return top emotion + uncertain flag
 *   < 0.40  → fall back to 'neutral' + uncertain flag
 *
 * @param {Float32Array} scores — softmax output, length 5
 */
function _applyConfidenceLogic(scores) {
  // Build allScores object for transparency / debugging
  const allScores = {};
  let maxIdx = 0;
  for (let i = 0; i < EMOTION_LABELS.length; i++) {
    allScores[EMOTION_LABELS[i]] = Math.round(scores[i] * 1000) / 1000;
    if (scores[i] > scores[maxIdx]) maxIdx = i;
  }

  const confidence = scores[maxIdx];
  const topEmotion = EMOTION_LABELS[maxIdx];

  if (confidence >= CONFIDENCE_HIGH) {
    return { emotion: topEmotion, confidence, allScores };
  }

  if (confidence >= CONFIDENCE_LOW) {
    return { emotion: topEmotion, confidence, allScores, uncertain: true };
  }

  // Below low threshold → default to neutral
  return { emotion: 'neutral', confidence, allScores, uncertain: true };
}

/**
 * Safely get a reference to the TensorFlow.js library.
 * Supports both global (script tag) and ES-module import scenarios.
 */
function _getTf() {
  if (typeof tf !== 'undefined') return tf;              // global <script> tag
  if (typeof window !== 'undefined' && window.tf) return window.tf;
  return null;
}
