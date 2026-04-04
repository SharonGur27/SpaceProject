/**
 * speech-to-text.js — Speech-to-Text Module
 *
 * Wraps the Web Speech API (SpeechRecognition) to convert the user's
 * spoken words into text strings in real time.
 *
 * How to explain it to a kid:
 *   "This is the part of Dekel's brain that turns your voice into words,
 *    like subtitles on a movie."
 *
 * Features:
 *   - Continuous mode: keeps listening until you tell it to stop
 *   - Interim results: shows words as you're still speaking
 *   - Final results: confirmed text when you pause
 *   - Auto-restart: if the browser stops listening, we start again
 *   - Fallback: if the browser doesn't support speech recognition,
 *     you can type instead
 *
 * @module speech-to-text
 */

// ── State ──────────────────────────────────────────────────────────

let recognition = null;          // The SpeechRecognition instance
let isListening = false;         // Whether we're actively listening
let shouldRestart = false;       // Whether to auto-restart after the browser stops

// Callback storage
let interimResultCallback = null;
let finalResultCallback = null;
let errorCallback = null;

// ── Browser Support Check ──────────────────────────────────────────

/**
 * The SpeechRecognition API has different names in different browsers:
 *   - Chrome/Edge: webkitSpeechRecognition
 *   - Firefox: SpeechRecognition (but may not be available)
 */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check if the browser supports the Web Speech API.
 *
 * @returns {boolean} True if speech recognition is available.
 */
function isSupported() {
  return !!SpeechRecognition;
}

/**
 * Start listening for speech.
 *
 * If the Web Speech API is available, we create a SpeechRecognition instance
 * and begin listening. The optional mediaStream parameter is accepted for
 * API compatibility but note that SpeechRecognition uses its own internal
 * mic access in most browsers.
 *
 * If the API is unavailable, callers should use the typed-text fallback
 * via submitText().
 *
 * @param {MediaStream} [mediaStream] - Optional. Accepted for interface
 *   compatibility; SpeechRecognition manages its own audio in most browsers.
 */
function start(mediaStream) {
  if (!isSupported()) {
    console.warn('[speech-to-text] SpeechRecognition not supported. Use submitText() for typed input.');
    if (errorCallback) {
      errorCallback(new Error(
        'Speech recognition is not supported in this browser. You can type instead.'
      ));
    }
    return;
  }

  // Don't start twice
  if (isListening) {
    return;
  }

  // Create a fresh recognition instance each time.
  // Some browsers behave oddly when reusing instances.
  recognition = new SpeechRecognition();

  // ── Configuration ────────────────────────────────────────────
  recognition.lang = 'en-US';          // Language: US English
  recognition.continuous = true;       // Don't stop after one sentence
  recognition.interimResults = true;   // Show partial results as user speaks
  recognition.maxAlternatives = 1;     // We only need the best guess

  // ── Event Handlers ───────────────────────────────────────────

  /**
   * The 'result' event fires whenever the browser has something to report.
   * Each result can be "interim" (still changing) or "final" (confirmed).
   */
  recognition.onresult = (event) => {
    // Process all new results since the last event
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();

      if (result.isFinal) {
        // The browser is confident about this text
        if (finalResultCallback && text.length > 0) {
          finalResultCallback(text);
        }
      } else {
        // Still listening — this text might change
        if (interimResultCallback && text.length > 0) {
          interimResultCallback(text);
        }
      }
    }
  };

  /**
   * The 'end' event fires when recognition stops — this can happen
   * because the user paused, the browser decided to stop, or there
   * was a network issue. If we're in continuous mode, we restart.
   */
  recognition.onend = () => {
    isListening = false;

    // Auto-restart if we haven't been told to stop
    if (shouldRestart) {
      console.log('[speech-to-text] Auto-restarting recognition…');
      // Small delay to avoid hammering the API
      setTimeout(() => {
        if (shouldRestart) {
          startRecognition();
        }
      }, 300);
    }
  };

  /**
   * Handle recognition errors.
   * Some errors are recoverable (network glitch), others aren't (no-speech).
   */
  recognition.onerror = (event) => {
    console.error('[speech-to-text] Error:', event.error);

    // 'no-speech' means the user is quiet — not really an error.
    // 'aborted' means we called stop() — also expected.
    // For these, we just let auto-restart handle it.
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return;
    }

    // 'not-allowed' means mic permission was denied at the browser level
    if (event.error === 'not-allowed') {
      shouldRestart = false; // Don't keep retrying
    }

    if (errorCallback) {
      errorCallback(new Error(`Speech recognition error: ${event.error}`));
    }
  };

  // ── Start Listening ──────────────────────────────────────────
  shouldRestart = true;
  startRecognition();
}

/**
 * Stop listening for speech. Turns off auto-restart.
 */
function stop() {
  shouldRestart = false;
  isListening = false;

  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      // stop() can throw if recognition isn't started — that's fine
    }
    recognition = null;
  }
}

/**
 * Fallback for browsers without SpeechRecognition.
 * Accepts typed text and fires the finalResult callback,
 * so the rest of the app doesn't need to know how the text arrived.
 *
 * @param {string} text - The typed text to process as if spoken.
 */
function submitText(text) {
  if (finalResultCallback && text && text.trim().length > 0) {
    finalResultCallback(text.trim());
  }
}

/**
 * Register a callback for interim (in-progress) results.
 * These update rapidly as the user speaks.
 *
 * @param {function} cb - Called with the partial text string.
 */
function onInterimResult(cb) {
  interimResultCallback = cb;
}

/**
 * Register a callback for final (confirmed) results.
 * These fire when the user pauses or finishes a sentence.
 *
 * @param {function} cb - Called with the confirmed text string.
 */
function onFinalResult(cb) {
  finalResultCallback = cb;
}

/**
 * Register a callback for errors.
 *
 * @param {function} cb - Called with an Error object.
 */
function onError(cb) {
  errorCallback = cb;
}

// ── Internal Helpers ───────────────────────────────────────────────

/**
 * Actually start the recognition instance.
 * Wrapped in a try/catch because start() can throw if already started.
 */
function startRecognition() {
  if (!recognition) return;

  try {
    recognition.start();
    isListening = true;
    console.log('[speech-to-text] Listening…');
  } catch (e) {
    // Can throw if already started — safe to ignore
    console.warn('[speech-to-text] Could not start:', e.message);
  }
}

// ── Exports ────────────────────────────────────────────────────────

export default {
  start,
  stop,
  submitText,
  onInterimResult,
  onFinalResult,
  onError,
  isSupported
};

export {
  start,
  stop,
  submitText,
  onInterimResult,
  onFinalResult,
  onError,
  isSupported
};
