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
 * Scoring strategy (v2):
 *   - Each emotion uses a weighted sum + threshold-based bonuses for strong signals
 *   - Neutral is scored as a bounded residual (never starts above other scores)
 *   - Softmax temperature = 1.0 for decisive distributions
 *   - Console diagnostics log raw features, scores, and probabilities
 *
 * @module emotion-fallback
 */

const EMOTION_LABELS = Object.freeze(['calm', 'stressed', 'happy', 'sad', 'neutral']);

// Softmax temperature — lower = peakier / more decisive distributions
const TEMPERATURE = 1.0;

// Threshold (in z-score units) for bonus boosts on strong feature signals
const STRONG_SIGNAL = 0.8;

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

  console.log('[emotion-fallback] Raw features:', {
    pitch: _round(pitch), pitchVar: _round(pitchVar), energy: _round(energy),
    centroid: _round(centroid), zcr: _round(zcr), speechRate: _round(speechRate),
  });

  // ── Compute a raw "score" for each emotion ────────────────────────────
  // Weighted sums use stronger weights than v1 (0.3-0.5 vs 0.1-0.3).
  // Threshold bonuses add +0.3 when a key feature is strongly in the
  // expected direction, so even moderate z-scores can trigger a clear win.

  let calmScore =
    (-pitch * 0.4) + (-pitchVar * 0.4) + (-energy * 0.2) +
    (-speechRate * 0.3) + (-zcr * 0.2) + (-centroid * 0.1);
  // Bonus: if pitch AND energy are both clearly low → calm
  if (pitch < -STRONG_SIGNAL && energy < -STRONG_SIGNAL) calmScore += 0.4;
  if (speechRate < -STRONG_SIGNAL) calmScore += 0.2;

  let stressedScore =
    (pitch * 0.35) + (pitchVar * 0.2) + (energy * 0.4) +
    (centroid * 0.15) + (zcr * 0.2) + (speechRate * 0.2);
  // Bonus: high energy + high pitch = strong stress signal
  if (energy > STRONG_SIGNAL && pitch > STRONG_SIGNAL) stressedScore += 0.4;
  if (zcr > STRONG_SIGNAL) stressedScore += 0.2;

  let happyScore =
    (pitch * 0.35) + (pitchVar * 0.4) + (energy * 0.3) +
    (speechRate * 0.15) + (centroid * 0.15) + (-zcr * 0.05);
  // Bonus: high pitch variance is the hallmark of expressive/happy speech
  if (pitchVar > STRONG_SIGNAL && energy > 0) happyScore += 0.4;
  if (pitch > STRONG_SIGNAL && pitchVar > STRONG_SIGNAL) happyScore += 0.2;

  let sadScore =
    (-pitch * 0.35) + (-pitchVar * 0.3) + (-energy * 0.45) +
    (-speechRate * 0.3) + (-centroid * 0.15);
  // Bonus: low energy is the strongest cue for sad speech
  if (energy < -STRONG_SIGNAL && speechRate < -STRONG_SIGNAL) sadScore += 0.4;
  if (pitch < -STRONG_SIGNAL && energy < -STRONG_SIGNAL) sadScore += 0.2;

  // NEUTRAL: small residual score — only wins when nothing else is strong.
  // Max of 0.3 at perfectly zero features; drops fast as features deviate.
  const totalDeviation =
    Math.abs(pitch) + Math.abs(pitchVar) + Math.abs(energy) +
    Math.abs(centroid) + Math.abs(zcr) + Math.abs(speechRate);
  let neutralScore = Math.max(0, 0.3 - totalDeviation * 0.12);

  const scores = {
    calm:     calmScore,
    stressed: stressedScore,
    happy:    happyScore,
    sad:      sadScore,
    neutral:  neutralScore,
  };

  console.log('[emotion-fallback] Raw scores:', Object.fromEntries(
    EMOTION_LABELS.map(l => [l, _round(scores[l])])
  ));

  // ── Softmax normalisation ─────────────────────────────────────────────
  const expScores = {};
  let expSum = 0;
  for (const label of EMOTION_LABELS) {
    expScores[label] = Math.exp(scores[label] / TEMPERATURE);
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

  console.log('[emotion-fallback] Probabilities:', allScores, '→', maxLabel,
    `(${_round(confidence)})`);

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

/** Round to 3 decimal places for readable logs */
function _round(v) {
  return Math.round(v * 1000) / 1000;
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
