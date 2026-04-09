/**
 * audio-features.js — Real-time audio feature extraction from microphone input
 *
 * Extracts 6 prosody features from live audio using Web Audio API's AnalyserNode:
 *   [0] Mean Pitch (F0)       — fundamental frequency via autocorrelation
 *   [1] Pitch Variance        — std deviation of pitch samples in window
 *   [2] Energy (RMS)          — root mean square of time-domain amplitude
 *   [3] Spectral Centroid     — "brightness" — weighted mean of FFT bins
 *   [4] Zero Crossing Rate    — sign changes per sample in time-domain data
 *   [5] Speech Rate Proxy     — energy-envelope peak count (syllable estimate)
 *
 * Design notes:
 * - AnalyserNode.fftSize = 2048 → 1024 frequency bins
 * - Buffers ~2-3 seconds of frames, emits features every ~500 ms
 * - Silent frames (RMS < threshold) are skipped
 * - Pitch detection uses autocorrelation with a correlation-peak threshold of 0.5
 * - All features are z-score normalized using predefined statistics
 *
 * @module audio-features
 */

// ── Normalization statistics ────────────────────────────────────────────────
// Tuned for browser getUserMedia audio (Chrome/Edge, default mic gain).
// Browser mic RMS is typically lower than studio-recorded training data,
// and spectral centroid tends to sit lower due to codec and AGC effects.
// These produce z-scores that spread across [-2, +2] for normal speech.
const DEFAULT_NORM_STATS = {
  meanPitch:        { mean: 170,   std: 50   },  // Hz — getUserMedia F0 range
  pitchVariance:    { mean: 20,    std: 15   },  // Hz — browser variance is lower
  energy:           { mean: 0.02,  std: 0.02 },  // RMS — browser mic levels are quiet
  spectralCentroid: { mean: 1800,  std: 700  },  // Hz — slightly lower for browser audio
  zeroCrossingRate: { mean: 0.07,  std: 0.04 },  // crossings per sample
  speechRate:       { mean: 3.5,   std: 1.5  },  // peaks per second
};

// ── Module constants ────────────────────────────────────────────────────────
const FFT_SIZE = 2048;

// Pitch detection bounds (Hz). Human voice sits in ~80-400 Hz.
const MIN_PITCH_HZ = 80;
const MAX_PITCH_HZ = 400;

// RMS below this → frame is silent → skip it
// Lowered from 0.01 — browser mics with AGC produce quieter signals
const SILENCE_THRESHOLD = 0.005;

// Autocorrelation: require this minimum peak strength to accept a pitch value.
// Values below 0.5 are usually noise rather than voiced speech.
const MIN_CORRELATION = 0.5;

// How often we emit a feature vector (ms)
const EMIT_INTERVAL_MS = 500;

// How often we sample the AnalyserNode (ms). ~23 ms ≈ 1 frame at 44.1 kHz/2048.
const FRAME_INTERVAL_MS = 23;

// ── State ───────────────────────────────────────────────────────────────────
let analyserNode = null;
let audioContext = null;
let sampleRate = 44100;

let timeDomainBuffer = null;   // Float32Array – reused per frame
let frequencyBuffer = null;    // Float32Array – reused per frame

let frameTimer = null;         // setInterval id for frame collection
let emitTimer = null;          // setInterval id for feature emission

// Rolling window of per-frame measurements over the last ~2-3 s
let pitchSamples = [];
let energySamples = [];
let spectralCentroidSamples = [];
let zcrSamples = [];
// Energy envelope for speech-rate estimation
let energyEnvelope = [];

let latestFeatures = null;     // Float32Array(6) | null
let callbacks = [];            // registered onFeaturesReady listeners
let normStats = { ...DEFAULT_NORM_STATS };

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialise the feature extractor with an AnalyserNode and AudioContext.
 * Does NOT start extraction — call startExtraction() when ready.
 *
 * @param {AnalyserNode} node   — an AnalyserNode connected to the mic source
 * @param {AudioContext}  ctx   — the AudioContext owning the node
 */
export function init(node, ctx) {
  analyserNode = node;
  audioContext = ctx;
  sampleRate = ctx.sampleRate;

  // Force FFT size for consistent bin count
  analyserNode.fftSize = FFT_SIZE;
  analyserNode.smoothingTimeConstant = 0.3;

  // Allocate typed-array buffers once
  timeDomainBuffer = new Float32Array(analyserNode.fftSize);
  frequencyBuffer = new Float32Array(analyserNode.frequencyBinCount); // fftSize / 2
}

/**
 * Begin real-time feature extraction.
 * Frames are collected every ~23 ms; features emitted every ~500 ms.
 */
export function startExtraction() {
  if (!analyserNode || !audioContext) {
    console.error('[audio-features] Call init() before startExtraction()');
    return;
  }

  // Clear any stale state
  _resetBuffers();

  // Collect a frame every ~23 ms
  frameTimer = setInterval(_collectFrame, FRAME_INTERVAL_MS);

  // Emit aggregated features every ~500 ms
  emitTimer = setInterval(_emitFeatures, EMIT_INTERVAL_MS);
}

/**
 * Stop feature extraction and release timers.
 */
export function stopExtraction() {
  if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
  if (emitTimer)  { clearInterval(emitTimer);  emitTimer = null;  }
  _resetBuffers();
}

/**
 * Register a callback that fires whenever a new feature vector is ready.
 * @param {function(Float32Array): void} cb
 */
export function onFeaturesReady(cb) {
  if (typeof cb === 'function') {
    callbacks.push(cb);
  }
}

/**
 * Return the most recently computed feature vector, or null if none yet.
 * @returns {Float32Array|null}
 */
export function getLatestFeatures() {
  return latestFeatures;
}

/**
 * Override the normalization statistics (e.g. after loading from model dir).
 * @param {object} stats — same shape as DEFAULT_NORM_STATS
 */
export function setNormalizationStats(stats) {
  normStats = { ...DEFAULT_NORM_STATS, ...stats };
}

// ── Internal: per-frame collection ──────────────────────────────────────────

function _collectFrame() {
  // Read time-domain and frequency-domain data from the AnalyserNode
  analyserNode.getFloatTimeDomainData(timeDomainBuffer);
  analyserNode.getFloatFrequencyData(frequencyBuffer);

  // ── 1. Energy (RMS) ──────────────────────────────────────────────────
  const rms = _computeRMS(timeDomainBuffer);
  energySamples.push(rms);
  energyEnvelope.push(rms);

  // Skip pitch / spectral / ZCR analysis for silent frames
  if (rms < SILENCE_THRESHOLD) return;

  // ── 2. Pitch via autocorrelation ─────────────────────────────────────
  const pitch = _detectPitch(timeDomainBuffer, sampleRate);
  if (pitch !== null) {
    pitchSamples.push(pitch);
  }

  // ── 3. Spectral centroid ─────────────────────────────────────────────
  const centroid = _computeSpectralCentroid(frequencyBuffer, sampleRate);
  spectralCentroidSamples.push(centroid);

  // ── 4. Zero crossing rate ────────────────────────────────────────────
  const zcr = _computeZCR(timeDomainBuffer);
  zcrSamples.push(zcr);
}

// ── Internal: aggregate and emit ────────────────────────────────────────────

function _emitFeatures() {
  // Need at least some voiced frames to produce a meaningful vector
  if (pitchSamples.length < 2) return;

  // ── Raw feature computation ──────────────────────────────────────────
  const meanPitch = _mean(pitchSamples);
  const pitchVar  = _stddev(pitchSamples);
  const meanEnergy = _mean(energySamples);
  const meanCentroid = _mean(spectralCentroidSamples);
  const meanZCR   = _mean(zcrSamples);
  const speechRate = _estimateSpeechRate(energyEnvelope);

  // ── Z-score normalisation ────────────────────────────────────────────
  // z = (x - μ) / σ   —   centres features around 0 with unit variance
  const features = new Float32Array(6);
  features[0] = _zScore(meanPitch,    normStats.meanPitch);
  features[1] = _zScore(pitchVar,     normStats.pitchVariance);
  features[2] = _zScore(meanEnergy,   normStats.energy);
  features[3] = _zScore(meanCentroid, normStats.spectralCentroid);
  features[4] = _zScore(meanZCR,      normStats.zeroCrossingRate);
  features[5] = _zScore(speechRate,   normStats.speechRate);

  latestFeatures = features;

  // Notify listeners
  for (const cb of callbacks) {
    try { cb(features); } catch (e) { console.error('[audio-features] callback error', e); }
  }

  // Slide the window — keep last quarter of samples for continuity
  _trimBuffers();
}

// ── DSP helpers ─────────────────────────────────────────────────────────────

/**
 * Root Mean Square of a signal buffer.
 * RMS = sqrt( (1/N) * Σ x² )
 */
function _computeRMS(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / buf.length);
}

/**
 * Pitch detection via autocorrelation.
 *
 * Autocorrelation measures how similar a signal is to a time-shifted copy of
 * itself. For a periodic signal (like a sustained vowel), the autocorrelation
 * peaks at a lag equal to the period T. The fundamental frequency is then
 * F0 = sampleRate / T.
 *
 * Algorithm:
 *   1. Compute the autocorrelation R(τ) for lag τ in [minLag, maxLag]
 *      where minLag/maxLag correspond to MAX_PITCH_HZ/MIN_PITCH_HZ.
 *   2. Normalise R(τ) by R(0) so perfect correlation = 1.0.
 *   3. Walk from minLag upward. Find the first lag where normalised R(τ)
 *      exceeds MIN_CORRELATION. This is likely the fundamental period.
 *   4. Return sampleRate / bestLag as the pitch in Hz.
 *
 * Returns null if no confident pitch is found (unvoiced / noise).
 */
function _detectPitch(buf, sr) {
  const n = buf.length;

  // Lag bounds from pitch range
  const minLag = Math.floor(sr / MAX_PITCH_HZ);  // e.g. 44100/400 = 110
  const maxLag = Math.floor(sr / MIN_PITCH_HZ);   // e.g. 44100/80  = 551

  // R(0) — energy of the signal (used to normalise)
  let rxx0 = 0;
  for (let i = 0; i < n; i++) rxx0 += buf[i] * buf[i];
  if (rxx0 === 0) return null; // dead silence

  let bestLag = -1;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    // R(lag) = Σ x[i] * x[i + lag]
    let rxx = 0;
    for (let i = 0; i < n - lag; i++) {
      rxx += buf[i] * buf[i + lag];
    }

    // Normalise so 1.0 = perfect periodicity
    const norm = rxx / rxx0;

    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }

  if (bestCorr < MIN_CORRELATION || bestLag <= 0) return null;

  return sr / bestLag;
}

/**
 * Spectral centroid — the "centre of mass" of the frequency spectrum.
 *
 * SC = Σ(f_k * |X_k|) / Σ|X_k|)
 *
 * where f_k is the frequency of bin k and |X_k| is its magnitude.
 * A higher centroid → brighter / more energetic voice.
 *
 * Note: getFloatFrequencyData() returns dB values, so we convert to linear
 * magnitude first: mag = 10^(dB/20).
 */
function _computeSpectralCentroid(freqBuf, sr) {
  const binCount = freqBuf.length;
  const binWidth = (sr / 2) / binCount; // Hz per bin (Nyquist / binCount)

  let weightedSum = 0;
  let magnitudeSum = 0;

  for (let k = 0; k < binCount; k++) {
    // Convert dB to linear magnitude
    const mag = Math.pow(10, freqBuf[k] / 20);
    const freq = k * binWidth;
    weightedSum += freq * mag;
    magnitudeSum += mag;
  }

  if (magnitudeSum === 0) return 0;
  return weightedSum / magnitudeSum;
}

/**
 * Zero Crossing Rate — the fraction of consecutive samples that change sign.
 *
 * ZCR = (1 / (N-1)) * Σ |sign(x[i]) - sign(x[i-1])| / 2
 *
 * Higher ZCR → noisier or more fricative-heavy speech (often stressed / tense).
 */
function _computeZCR(buf) {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i] >= 0 && buf[i - 1] < 0) || (buf[i] < 0 && buf[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (buf.length - 1);
}

/**
 * Speech rate proxy — count peaks in the energy envelope.
 *
 * Voiced syllables produce energy peaks. Counting peaks per second gives a
 * rough estimate of speaking tempo. We smooth the envelope first to avoid
 * counting noise spikes.
 *
 * Returns peaks per second.
 */
function _estimateSpeechRate(envelope) {
  if (envelope.length < 3) return 0;

  // Smooth with a simple moving average (window = 5 frames ≈ 115 ms)
  const smoothed = _movingAverage(envelope, 5);

  // Adaptive threshold: mean energy of the window
  const threshold = _mean(smoothed) * 1.2;

  // Count peaks: a sample is a peak if it's above threshold and higher than
  // both its immediate neighbors
  let peaks = 0;
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > threshold &&
        smoothed[i] > smoothed[i - 1] &&
        smoothed[i] > smoothed[i + 1]) {
      peaks++;
    }
  }

  // Duration of the envelope in seconds
  const durationSec = (envelope.length * FRAME_INTERVAL_MS) / 1000;
  if (durationSec === 0) return 0;

  return peaks / durationSec;
}

// ── Math utilities ──────────────────────────────────────────────────────────

function _mean(arr) {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function _stddev(arr) {
  if (arr.length < 2) return 0;
  const m = _mean(arr);
  let sqSum = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sqSum += d * d;
  }
  return Math.sqrt(sqSum / (arr.length - 1));
}

function _zScore(value, stats) {
  if (stats.std === 0) return 0;
  return (value - stats.mean) / stats.std;
}

function _movingAverage(arr, windowSize) {
  const result = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}

// ── Buffer management ───────────────────────────────────────────────────────

function _resetBuffers() {
  pitchSamples = [];
  energySamples = [];
  spectralCentroidSamples = [];
  zcrSamples = [];
  energyEnvelope = [];
  latestFeatures = null;
}

/**
 * Keep the most recent quarter of samples for overlap / continuity.
 * This prevents hard window boundaries from causing sudden jumps.
 */
function _trimBuffers() {
  const keep = (arr) => arr.slice(Math.floor(arr.length * 0.75));
  pitchSamples = keep(pitchSamples);
  energySamples = keep(energySamples);
  spectralCentroidSamples = keep(spectralCentroidSamples);
  zcrSamples = keep(zcrSamples);
  energyEnvelope = keep(energyEnvelope);
}
