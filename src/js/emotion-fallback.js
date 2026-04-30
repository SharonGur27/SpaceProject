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
 * Improvements over v2:
 *   - Temporal smoothing (EMA) prevents rapid flickering between emotions
 *   - Hysteresis: current emotion must be beaten by a meaningful margin to switch
 *   - Better stressed/happy disambiguation using ZCR + centroid (stress is harsh)
 *   - Better calm/sad disambiguation using pitch variance (calm is steady)
 *   - Feature combination patterns detect multi-signal convergence
 *
 * @module emotion-fallback
 */

const EMOTION_LABELS = Object.freeze(['calm', 'stressed', 'happy', 'sad', 'neutral']);

// Softmax temperature — lower = peakier / more decisive distributions
const TEMPERATURE = 0.8;

// Threshold (in z-score units) for bonus boosts on strong feature signals
const STRONG_SIGNAL = 0.7;
const MODERATE_SIGNAL = 0.4;

// Temporal smoothing — exponential moving average factor (0-1, higher = more responsive)
const EMA_ALPHA = 0.35;

// Hysteresis — how much a new emotion must beat the current one to trigger a switch
const SWITCH_THRESHOLD = 0.08;

// ── State for temporal smoothing ─────────────────────────────────────────────
let smoothedScores = null;  // EMA-smoothed probability distribution
let currentEmotion = 'neutral';
let stabilityCounter = 0;  // frames the current emotion has been dominant

/**
 * Reset the temporal smoothing state (e.g., on new conversation).
 */
export function resetState() {
  smoothedScores = null;
  currentEmotion = 'neutral';
  stabilityCounter = 0;
}

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

  // ── Compute raw scores for each emotion ────────────────────────────────
  // Uses feature interaction patterns, not just linear weights.

  // CALM: low pitch, low variance (steady), moderate energy, slow rate
  let calmScore =
    (-pitch * 0.3) + (-pitchVar * 0.5) + (-energy * 0.15) +
    (-speechRate * 0.3) + (-zcr * 0.15) + (-centroid * 0.1);
  // Key pattern: steady voice (low variance) with low pitch
  if (pitchVar < -MODERATE_SIGNAL && pitch < 0) calmScore += 0.3;
  if (pitch < -STRONG_SIGNAL && energy < -MODERATE_SIGNAL) calmScore += 0.3;
  if (speechRate < -MODERATE_SIGNAL && pitchVar < -MODERATE_SIGNAL) calmScore += 0.2;
  // Anti-pattern: high ZCR or high centroid is NOT calm
  if (zcr > STRONG_SIGNAL) calmScore -= 0.3;

  // STRESSED: high pitch, high energy, high ZCR, high centroid (harsh/tense)
  let stressedScore =
    (pitch * 0.3) + (energy * 0.35) + (zcr * 0.3) +
    (centroid * 0.25) + (speechRate * 0.15) + (pitchVar * 0.1);
  // Key pattern: harsh voice — high ZCR + high centroid distinguishes from happy
  if (zcr > MODERATE_SIGNAL && centroid > MODERATE_SIGNAL) stressedScore += 0.4;
  if (energy > STRONG_SIGNAL && zcr > MODERATE_SIGNAL) stressedScore += 0.3;
  if (pitch > STRONG_SIGNAL && energy > STRONG_SIGNAL) stressedScore += 0.2;
  // Anti-pattern: high pitch variance with low ZCR → more likely happy
  if (pitchVar > STRONG_SIGNAL && zcr < 0) stressedScore -= 0.3;

  // HAPPY: high pitch variance (melodic), moderate-high energy, smooth (low ZCR)
  // Key insight: happy requires BOTH expressiveness AND energy — tired/neutral voices lack energy
  let happyScore =
    (pitchVar * 0.35) + (pitch * 0.15) + (energy * 0.35) +
    (speechRate * 0.15) + (-zcr * 0.1) + (centroid * 0.05);
  // Key pattern: melodic voice — high pitch variance with smooth delivery AND energy
  if (pitchVar > STRONG_SIGNAL && zcr < MODERATE_SIGNAL && energy > 0) happyScore += 0.4;
  if (pitchVar > STRONG_SIGNAL && energy > MODERATE_SIGNAL) happyScore += 0.3;
  if (pitch > MODERATE_SIGNAL && pitchVar > STRONG_SIGNAL && zcr < MODERATE_SIGNAL) happyScore += 0.2;
  // Anti-pattern: harsh voice (high ZCR + centroid) → stressed, not happy
  if (zcr > STRONG_SIGNAL && centroid > STRONG_SIGNAL) happyScore -= 0.3;
  // Anti-pattern: low energy → NOT happy (tired/neutral/sad, not joyful)
  if (energy < -MODERATE_SIGNAL) happyScore -= 0.4;
  if (energy < 0 && pitchVar < STRONG_SIGNAL) happyScore -= 0.2;

  // SAD: low energy, low pitch, slow rate, low centroid (dull/flat)
  let sadScore =
    (-energy * 0.45) + (-pitch * 0.25) + (-speechRate * 0.3) +
    (-centroid * 0.2) + (-pitchVar * 0.2);
  // Key pattern: flat and quiet voice
  if (energy < -STRONG_SIGNAL && speechRate < -MODERATE_SIGNAL) sadScore += 0.4;
  if (energy < -MODERATE_SIGNAL && pitchVar < -MODERATE_SIGNAL) sadScore += 0.3;
  if (pitch < -MODERATE_SIGNAL && centroid < -MODERATE_SIGNAL) sadScore += 0.2;
  // Discriminate from calm: sad has lower centroid and slower rate
  if (energy < -MODERATE_SIGNAL && centroid > 0) sadScore -= 0.2;

  // NEUTRAL: only wins when nothing else is strong
  const totalDeviation =
    Math.abs(pitch) + Math.abs(pitchVar) + Math.abs(energy) +
    Math.abs(centroid) + Math.abs(zcr) + Math.abs(speechRate);
  let neutralScore = Math.max(0, 0.6 - totalDeviation * 0.12);
  // Bonus if all features are near zero (normal speech)
  if (totalDeviation < 2.0) neutralScore += 0.35;
  if (totalDeviation < 1.2) neutralScore += 0.25;
  // Suppress non-neutral when features are in the neutral zone
  if (totalDeviation < 2.5) {
    calmScore -= 0.15;
    stressedScore -= 0.15;
    happyScore -= 0.15;
    sadScore -= 0.15;
  }

  const rawScores = [calmScore, stressedScore, happyScore, sadScore, neutralScore];

  console.log('[emotion-fallback] Raw scores:', Object.fromEntries(
    EMOTION_LABELS.map((l, i) => [l, _round(rawScores[i])])
  ));

  // ── Softmax normalisation ─────────────────────────────────────────────
  let expScores = [];
  let expSum = 0;
  for (let i = 0; i < rawScores.length; i++) {
    const e = Math.exp(rawScores[i] / TEMPERATURE);
    expScores.push(e);
    expSum += e;
  }

  let instantProbs = [];
  for (let i = 0; i < EMOTION_LABELS.length; i++) {
    instantProbs.push(expSum > 0 ? expScores[i] / expSum : 0.2);
  }

  // ── Temporal smoothing (EMA) ──────────────────────────────────────────
  if (smoothedScores === null) {
    smoothedScores = [...instantProbs];
  } else {
    for (let i = 0; i < smoothedScores.length; i++) {
      smoothedScores[i] = EMA_ALPHA * instantProbs[i] + (1 - EMA_ALPHA) * smoothedScores[i];
    }
  }

  // Find winner from smoothed scores
  const allScores = {};
  let maxIdx = 4; // neutral
  let maxProb = 0;
  for (let i = 0; i < EMOTION_LABELS.length; i++) {
    allScores[EMOTION_LABELS[i]] = Math.round(smoothedScores[i] * 1000) / 1000;
    if (smoothedScores[i] > maxProb) {
      maxProb = smoothedScores[i];
      maxIdx = i;
    }
  }

  // ── Hysteresis: resist switching unless new emotion is clearly stronger ──
  const newEmotion = EMOTION_LABELS[maxIdx];
  const currentIdx = EMOTION_LABELS.indexOf(currentEmotion);
  const currentProb = currentIdx >= 0 ? smoothedScores[currentIdx] : 0;

  if (newEmotion !== currentEmotion) {
    // New emotion must beat current by SWITCH_THRESHOLD to take over
    if (maxProb - currentProb > SWITCH_THRESHOLD) {
      currentEmotion = newEmotion;
      stabilityCounter = 1;
    } else {
      stabilityCounter++;
    }
  } else {
    stabilityCounter++;
  }

  const confidence = maxProb;
  const reportedEmotion = currentEmotion;

  console.log('[emotion-fallback] Probabilities:', allScores, '→', reportedEmotion,
    `(${_round(confidence)}, stability: ${stabilityCounter})`);

  // Apply confidence thresholds
  if (confidence >= 0.50) {
    return { emotion: reportedEmotion, confidence, allScores };
  }
  if (confidence >= 0.35) {
    return { emotion: reportedEmotion, confidence, allScores, uncertain: true };
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
