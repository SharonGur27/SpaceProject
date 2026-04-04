/**
 * emotion-fallback.js — Rule-based emotion estimation from audio features
 *
 * This module provides a deterministic, threshold-based alternative to the
 * TensorFlow.js model. It exists so the full app can run end-to-end before
 * the real ML model is trained (Phase 2).
 *
 * It reads the same 6-element z-score-normalised feature vector that the
 * neural network would consume:
 *
 *   [0] Mean Pitch (F0)        — higher → more aroused / stressed
 *   [1] Pitch Variance          — higher → more expressive (happy/stressed)
 *   [2] Energy (RMS)            — louder → stressed/happy; quieter → calm/sad
 *   [3] Spectral Centroid       — brighter voice → more arousal
 *   [4] Zero Crossing Rate      — higher → more stressed
 *   [5] Speech Rate Proxy       — faster → stressed/happy; slower → calm/sad
 *
 * All values are z-scores (mean 0, std 1). Positive = above average.
 *
 * The rules below encode known prosody–emotion correlations from the speech
 * emotion recognition literature (Scherer 2003, Juslin & Laukka 2003).
 *
 * @module emotion-fallback
 */

const EMOTION_LABELS = Object.freeze(['calm', 'stressed', 'happy', 'sad', 'neutral']);

/**
 * Predict emotion from z-score normalised feature vector using hand-crafted rules.
 *
 * @param {Float32Array|number[]} features — length 6, z-score normalised
 * @returns {{ emotion: string, confidence: number, allScores: Object, uncertain?: boolean }}
 */
export function predictFromFeatures(features) {
  if (!features || features.length < 6) {
    return _neutralResult();
  }

  const [pitch, pitchVar, energy, centroid, zcr, speechRate] = features;

  // ── Compute a raw "score" for each emotion ────────────────────────────
  // Each score is a weighted sum of how well the features match the known
  // prosody profile for that emotion. Weights are hand-tuned heuristics.

  const scores = {
    // CALM: low pitch, low variance, moderate energy, slow rate, low ZCR
    calm:     _clamp((-pitch * 0.3) + (-pitchVar * 0.3) + (-energy * 0.1) + (-speechRate * 0.2) + (-zcr * 0.1)),

    // STRESSED: high pitch, high variance, high energy, fast rate, high ZCR, bright voice
    stressed: _clamp((pitch * 0.2) + (pitchVar * 0.15) + (energy * 0.25) + (centroid * 0.1) + (zcr * 0.15) + (speechRate * 0.15)),

    // HAPPY: higher pitch, high variance, moderate-high energy, moderate rate
    happy:    _clamp((pitch * 0.2) + (pitchVar * 0.25) + (energy * 0.2) + (speechRate * 0.1) + (-zcr * 0.05) + (centroid * 0.1)),

    // SAD: low pitch, low variance, low energy, slow rate
    sad:      _clamp((-pitch * 0.2) + (-pitchVar * 0.2) + (-energy * 0.3) + (-speechRate * 0.2) + (-centroid * 0.1)),

    // NEUTRAL: everything near zero (small absolute deviations)
    neutral:  _clamp(1.0 - (Math.abs(pitch) * 0.2 + Math.abs(pitchVar) * 0.2 + Math.abs(energy) * 0.2 + Math.abs(speechRate) * 0.2 + Math.abs(zcr) * 0.1 + Math.abs(centroid) * 0.1)),
  };

  // ── Softmax-like normalisation ────────────────────────────────────────
  // Convert raw scores to probabilities that sum to 1.
  // We exponentiate to ensure non-negative values and sharpen differences.
  const expScores = {};
  let expSum = 0;
  for (const label of EMOTION_LABELS) {
    // Temperature of 2.0 keeps probabilities from being too peaked
    expScores[label] = Math.exp(scores[label] * 2.0);
    expSum += expScores[label];
  }

  const allScores = {};
  let maxLabel = 'neutral';
  let maxProb = 0;
  for (const label of EMOTION_LABELS) {
    const prob = expSum > 0 ? expScores[label] / expSum : 0.2;
    allScores[label] = Math.round(prob * 1000) / 1000;
    if (prob > maxProb) {
      maxProb = prob;
      maxLabel = label;
    }
  }

  const confidence = maxProb;

  // Apply the same confidence thresholds as the ML model
  if (confidence >= 0.55) {
    return { emotion: maxLabel, confidence, allScores };
  }
  if (confidence >= 0.40) {
    return { emotion: maxLabel, confidence, allScores, uncertain: true };
  }
  return { emotion: 'neutral', confidence, allScores, uncertain: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a value to [-1, 1] to keep scores bounded */
function _clamp(v) {
  return Math.max(-1, Math.min(1, v));
}

/** Default result when features are missing or invalid */
function _neutralResult() {
  return {
    emotion: 'neutral',
    confidence: 0,
    allScores: { calm: 0.2, stressed: 0.2, happy: 0.2, sad: 0.2, neutral: 0.2 },
    uncertain: true,
  };
}
