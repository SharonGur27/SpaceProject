/**
 * mic-input.js — Microphone Input Module
 *
 * Captures audio from the user's microphone using getUserMedia().
 * Provides two outputs from a single mic stream:
 *   1. A raw MediaStream (for SpeechRecognition)
 *   2. A MediaStreamAudioSourceNode (for the audio feature extraction pipeline)
 *
 * How to explain it to a kid:
 *   "This is Dekel's ear. It turns on the microphone so Dekel can hear you."
 *
 * @module mic-input
 */

// ── State ──────────────────────────────────────────────────────────

let mediaStream = null;       // The raw MediaStream from getUserMedia
let audioContext = null;       // Web Audio API context for processing
let sourceNode = null;         // Audio source node connected to the mic stream

// Callback storage
let streamReadyCallback = null;
let errorCallback = null;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Request microphone permission and start capturing audio.
 * Creates an AudioContext and connects the mic as a source node.
 *
 * @returns {Promise<void>} Resolves when the mic is ready.
 * @throws Will call the error callback if permission is denied or mic fails.
 */
async function start() {
  try {
    // Request mic permission — the browser will show a permission dialog
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create the Web Audio API context for real-time audio processing.
    // AudioContext may start in a "suspended" state if no user gesture happened yet.
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // If the context is suspended (common on first load), try to resume it.
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Connect the mic stream to the AudioContext so we can process it
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Let listeners know the stream is ready
    if (streamReadyCallback) {
      streamReadyCallback(mediaStream);
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * Stop capturing audio and release the microphone.
 * This is important — if we don't do this, the browser shows a red dot
 * indicating the mic is still in use.
 */
function stop() {
  // Stop every audio track in the stream (releases the mic)
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  // Disconnect the source node from the audio graph
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  // Close the AudioContext to free system resources
  if (audioContext) {
    audioContext.close().catch(() => {
      // Closing can fail if already closed — that's fine
    });
    audioContext = null;
  }
}

/**
 * Get the raw MediaStream from the microphone.
 * Used by SpeechRecognition to listen to the user's words.
 *
 * @returns {MediaStream|null} The active mic stream, or null if not started.
 */
function getMediaStream() {
  return mediaStream;
}

/**
 * Get the AudioContext source node connected to the mic.
 * Used by the audio feature extraction pipeline (AnalyserNode, etc.)
 *
 * @returns {MediaStreamAudioSourceNode|null} The source node, or null if not started.
 */
function getSourceNode() {
  return sourceNode;
}

/**
 * Get the AudioContext instance.
 * Needed by audio-features.js to create AnalyserNodes.
 *
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  return audioContext;
}

/**
 * Register a callback for when the mic stream is ready.
 *
 * @param {function} cb - Called with the MediaStream when ready.
 */
function onStreamReady(cb) {
  streamReadyCallback = cb;
}

/**
 * Register a callback for when an error occurs.
 *
 * @param {function} cb - Called with a user-friendly error object.
 */
function onError(cb) {
  errorCallback = cb;
}

// ── Internal Helpers ───────────────────────────────────────────────

/**
 * Handle microphone errors with user-friendly messages.
 * Different errors mean different things — we translate them for the user.
 */
function handleError(error) {
  let userMessage;

  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    // The user clicked "Block" on the mic permission dialog
    userMessage = 'Microphone permission was denied. Dekel needs your mic to hear you. '
      + 'Please allow microphone access in your browser settings and try again.';
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    // No mic hardware detected
    userMessage = 'No microphone found. Please connect a microphone and try again.';
  } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    // Mic exists but another app has it locked
    userMessage = 'Could not access the microphone. It might be in use by another app. '
      + 'Try closing other apps that use the mic.';
  } else {
    // Something unexpected
    userMessage = `Microphone error: ${error.message || 'Unknown error occurred.'}`;
  }

  console.error('[mic-input]', userMessage, error);

  if (errorCallback) {
    errorCallback({ message: userMessage, originalError: error });
  }
}

// ── Exports ────────────────────────────────────────────────────────

export default {
  start,
  stop,
  getMediaStream,
  getSourceNode,
  getAudioContext,
  onStreamReady,
  onError
};

export {
  start,
  stop,
  getMediaStream,
  getSourceNode,
  getAudioContext,
  onStreamReady,
  onError
};
