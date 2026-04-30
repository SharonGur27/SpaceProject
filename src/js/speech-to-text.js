/**
 * speech-to-text.js — Speech-to-Text Module
 *
 * Wraps the Web Speech API (SpeechRecognition) to convert the user's
 * spoken words into text strings in real time.
 *
 * How to explain it to a kid:
 *   "This is the part of Dekel's brain that turns your voice into words,
 *    like subtitles on a movie. If the connection hiccups, it tries again
 *    automatically — like when your Wi-Fi drops and your phone reconnects."
 *
 * Features:
 *   - Continuous mode: keeps listening until you tell it to stop
 *   - Interim results: shows words as you're still speaking
 *   - Final results: confirmed text when you pause
 *   - Auto-restart with backoff: if the browser stops listening, we start
 *     again — waiting a little longer each time to avoid hammering the API
 *   - Network retry: transient network errors get a few retries before
 *     giving up
 *   - Silence timeout: if recognition stalls, we proactively restart it
 *   - Status updates: tells the app when we're reconnecting vs. failed
 *   - Fallback: if the browser doesn't support speech recognition,
 *     you can type instead
 *
 * @module speech-to-text
 */

// ── State ──────────────────────────────────────────────────────────

let recognition = null;          // The SpeechRecognition instance
let isListening = false;         // Whether we're actively listening
let shouldRestart = false;       // Whether to auto-restart after the browser stops
let sessionId = 0;               // Incremented on each start(); stale handlers check this
let sttLanguage = 'en-US';       // Language for speech recognition

// Callback storage
let interimResultCallback = null;
let finalResultCallback = null;
let errorCallback = null;
let statusCallback = null;       // Notifies the app about reconnection status

// ── Reliability State ──────────────────────────────────────────────
// These track restart timing and error retries so we can be smart
// about recovering from glitches vs. giving up on real failures.

let restartDelay = 300;                   // Current restart delay (ms), grows with backoff
const RESTART_DELAY_INITIAL = 300;        // First restart: quick
const RESTART_DELAY_MAX = 5000;           // Cap: don't wait longer than 5 seconds
const BACKOFF_MULTIPLIER = 1.5;           // Each restart waits 1.5× longer

let networkRetryCount = 0;                // How many network errors in a row
const NETWORK_RETRY_MAX = 3;             // Give up after 3 consecutive network failures

let silenceTimer = null;                  // Fires if no results arrive for too long
const SILENCE_TIMEOUT_MS = 15000;         // 15 seconds of silence → proactive restart

let lastResultTime = 0;                   // Timestamp of last result (for logging)
let restartCount = 0;                     // Total restarts in this session (for logging)

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
    console.warn('[STT] SpeechRecognition not supported. Use submitText() for typed input.');
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

  // Reset reliability counters for a fresh session
  restartDelay = RESTART_DELAY_INITIAL;
  networkRetryCount = 0;
  restartCount = 0;
  lastResultTime = Date.now();
  sessionId++;

  const mySessionId = sessionId;
  console.log(`[STT] Starting session #${mySessionId}`);

  shouldRestart = true;
  createAndStartRecognition();
}

/**
 * Stop listening for speech. Turns off auto-restart.
 */
function stop() {
  shouldRestart = false;
  isListening = false;
  clearSilenceTimer();

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

/**
 * Register a callback for status changes during reconnection.
 * Lets the app show the user what's happening behind the scenes.
 *
 * @param {function} cb - Called with a status object:
 *   { state: 'reconnecting'|'failed', attempt: number, maxAttempts: number, reason: string }
 */
function onStatusChange(cb) {
  statusCallback = cb;
}

// ── Internal Helpers ───────────────────────────────────────────────

/**
 * Create a brand-new SpeechRecognition instance and start it.
 * We create a fresh instance every time because some browsers (especially
 * Chrome) have bugs when reusing an instance after errors.
 */
function createAndStartRecognition() {
  // Clean up any old instance
  if (recognition) {
    try { recognition.stop(); } catch (e) { /* ignore */ }
    recognition = null;
  }

  // Capture current session so stale handlers from old instances are ignored
  const mySessionId = sessionId;

  recognition = new SpeechRecognition();

  // ── Configuration ────────────────────────────────────────────
  recognition.lang = sttLanguage;          // Language for recognition
  recognition.continuous = true;       // Don't stop after one sentence
  recognition.interimResults = true;   // Show partial results as user speaks
  recognition.maxAlternatives = 1;     // We only need the best guess

  // ── Event Handlers ───────────────────────────────────────────

  /**
   * The 'result' event fires whenever the browser has something to report.
   * Each result can be "interim" (still changing) or "final" (confirmed).
   */
  recognition.onresult = (event) => {
    // Ignore events from a stale session
    if (mySessionId !== sessionId) return;

    // We got results — reset backoff and silence timer since things are working
    restartDelay = RESTART_DELAY_INITIAL;
    networkRetryCount = 0;
    lastResultTime = Date.now();
    resetSilenceTimer();

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
    // Ignore events from a stale session
    if (mySessionId !== sessionId) {
      console.log(`[STT] Ignoring stale onend from session #${mySessionId} (current: #${sessionId})`);
      return;
    }

    isListening = false;
    clearSilenceTimer();

    // Auto-restart if we haven't been told to stop
    if (shouldRestart) {
      restartCount++;
      console.log(`[STT] Recognition ended. Auto-restart #${restartCount} in ${restartDelay}ms…`);

      if (statusCallback && restartCount > 1) {
        statusCallback({ state: 'reconnecting', attempt: restartCount, reason: 'recognition ended' });
      }

      setTimeout(() => {
        if (shouldRestart && mySessionId === sessionId) {
          // Create a fresh instance each time to avoid browser quirks
          createAndStartRecognition();
        }
      }, restartDelay);

      // Increase delay for next time (exponential backoff with cap)
      restartDelay = Math.min(restartDelay * BACKOFF_MULTIPLIER, RESTART_DELAY_MAX);
    }
  };

  /**
   * Handle recognition errors.
   * Some errors are recoverable (network glitch), others aren't (permission denied).
   */
  recognition.onerror = (event) => {
    // Ignore events from a stale session
    if (mySessionId !== sessionId) return;

    console.warn(`[STT] Error: "${event.error}" (network retries: ${networkRetryCount}/${NETWORK_RETRY_MAX})`);

    // 'no-speech' means the user is quiet — not really an error.
    // 'aborted' means we called stop() — also expected.
    if (event.error === 'no-speech' || event.error === 'aborted') {
      return;
    }

    // ── Transient errors: retry with backoff ─────────────────
    if (event.error === 'network' || event.error === 'audio-capture') {
      networkRetryCount++;

      if (networkRetryCount <= NETWORK_RETRY_MAX) {
        console.log(`[STT] Transient "${event.error}" — will retry (${networkRetryCount}/${NETWORK_RETRY_MAX})`);
        if (statusCallback) {
          statusCallback({
            state: 'reconnecting',
            attempt: networkRetryCount,
            maxAttempts: NETWORK_RETRY_MAX,
            reason: event.error
          });
        }
        // Don't call errorCallback yet — let auto-restart handle it
        return;
      }

      // Exhausted retries — fall through to report as failure
      console.error(`[STT] "${event.error}" persisted after ${NETWORK_RETRY_MAX} retries — giving up`);
      if (statusCallback) {
        statusCallback({ state: 'failed', reason: event.error });
      }
    }

    // ── Non-recoverable errors ───────────────────────────────
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      shouldRestart = false; // Don't keep retrying
      console.error(`[STT] Non-recoverable: "${event.error}" — stopping`);
      if (statusCallback) {
        statusCallback({ state: 'failed', reason: event.error });
      }
    }

    if (errorCallback) {
      errorCallback(new Error(`Speech recognition error: ${event.error}`));
    }
  };

  // ── Actually start ───────────────────────────────────────────
  startRecognition();
}

/**
 * Actually start the recognition instance.
 * Wrapped in a try/catch because start() can throw if already started.
 */
function startRecognition() {
  if (!recognition) return;

  try {
    recognition.start();
    isListening = true;
    resetSilenceTimer();
    console.log('[STT] Listening…');
  } catch (e) {
    // Can throw if already started — safe to ignore
    console.warn('[STT] Could not start:', e.message);
  }
}

/**
 * Reset the silence timer. If no speech results arrive within
 * SILENCE_TIMEOUT_MS, we proactively restart recognition.
 * This catches the case where the browser's connection to Google's
 * speech servers silently dies.
 */
function resetSilenceTimer() {
  clearSilenceTimer();
  if (!shouldRestart) return;

  silenceTimer = setTimeout(() => {
    if (isListening && shouldRestart) {
      const silenceSec = Math.round((Date.now() - lastResultTime) / 1000);
      console.warn(`[STT] No results for ${silenceSec}s — proactively restarting`);
      // Stop current instance and let onend trigger a fresh restart
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
  }, SILENCE_TIMEOUT_MS);
}

/**
 * Clear the silence timer so it doesn't fire.
 */
function clearSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

// ── Exports ────────────────────────────────────────────────────────

/**
 * Set the language for speech recognition.
 * @param {'en'|'he'} lang
 */
function setLanguage(lang) {
  sttLanguage = lang === 'he' ? 'he-IL' : 'en-US';
  console.log('[speech-to-text] Language set to:', sttLanguage);
}

export default {
  start,
  stop,
  submitText,
  onInterimResult,
  onFinalResult,
  onError,
  onStatusChange,
  isSupported,
  setLanguage
};

export {
  start,
  stop,
  submitText,
  onInterimResult,
  onFinalResult,
  onError,
  onStatusChange,
  isSupported,
  setLanguage
};
