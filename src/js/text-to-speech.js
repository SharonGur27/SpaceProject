/**
 * text-to-speech.js — Text-to-Speech Module
 *
 * Wraps the Web Speech Synthesis API so Dekel can talk back to the user.
 * Supports emotion-adjusted voice parameters — when Dekel detects that
 * the user is stressed, it speaks more slowly and calmly.
 *
 * How to explain it to a kid:
 *   "This is Dekel's mouth. It reads the words out loud, and it changes
 *    how it talks depending on how you're feeling."
 *
 * @module text-to-speech
 */

// ── Emotion Presets ────────────────────────────────────────────────

/**
 * Voice parameter adjustments based on the detected emotion.
 * These make Dekel sound different depending on how the user is feeling:
 *
 *   - calm:     normal pitch, slightly slow — relaxed and reassuring
 *   - stressed: lower pitch, slower — gentle and grounding
 *   - happy:    slightly higher pitch, normal speed — warm and bright
 *   - sad:      lower pitch, slower — soft and empathetic
 *   - neutral:  normal pitch, slightly below normal speed — steady
 */
const EMOTION_PRESETS = {
  calm:     { pitch: 1.0, rate: 0.9  },
  stressed: { pitch: 0.9, rate: 0.85 },
  happy:    { pitch: 1.1, rate: 1.0  },
  sad:      { pitch: 0.9, rate: 0.85 },
  neutral:  { pitch: 1.0, rate: 0.95 }
};

// ── Constants ──────────────────────────────────────────────────────

const WATCHDOG_TIMEOUT_MS = 60000;    // Force-resolve speak() after 60s (Chrome onend bug)
const KEEPALIVE_INTERVAL_MS = 10000;  // Chrome drops onend for long utterances; pulse every 10s

// ── State ──────────────────────────────────────────────────────────

let speaking = false;           // Whether Dekel is currently speaking
let selectedVoice = null;       // The voice we've chosen to use
let voicesLoaded = false;       // Whether the browser's voice list is ready
let keepaliveTimer = null;      // Chrome pause/resume keepalive interval

// Callback storage
let startCallback = null;
let endCallback = null;

// ── Voice Selection ────────────────────────────────────────────────

/**
 * Pick the best available voice for Dekel.
 *
 * We prefer natural-sounding English voices. The browser offers many voices
 * but some sound robotic. We look for ones with "Natural" or "Google" in
 * the name, or fall back to any English voice.
 */
function selectBestVoice() {
  const voices = window.speechSynthesis.getVoices();

  if (voices.length === 0) return;

  // Filter to English voices
  const englishVoices = voices.filter(v =>
    v.lang.startsWith('en')
  );

  if (englishVoices.length === 0) {
    // No English voices? Use whatever is available
    selectedVoice = voices[0];
    return;
  }

  // Prefer voices that sound natural (these names vary by browser/OS)
  const preferred = englishVoices.find(v =>
    v.name.includes('Natural') ||
    v.name.includes('Google') ||
    v.name.includes('Microsoft') && v.name.includes('Online')
  );

  selectedVoice = preferred || englishVoices[0];

  console.log('[text-to-speech] Selected voice:', selectedVoice.name);
}

// Listen for voices to load — some browsers load them asynchronously
if (typeof window !== 'undefined' && window.speechSynthesis) {
  // Try immediately (voices might already be loaded)
  selectBestVoice();

  // Also listen for the voiceschanged event (Chrome loads voices async)
  window.speechSynthesis.onvoiceschanged = () => {
    if (!voicesLoaded) {
      selectBestVoice();
      voicesLoaded = true;
    }
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Speak the given text aloud.
 *
 * Adjusts pitch and rate based on the detected emotion, so Dekel's
 * voice matches the emotional context of the conversation.
 *
 * Queue management: if Dekel is already speaking, the current speech
 * is cancelled before the new one starts. We don't want overlapping voices.
 *
 * @param {string} text - The text for Dekel to say.
 * @param {object} [options] - Optional voice parameters.
 * @param {number} [options.pitch] - Override pitch (0.1 to 2.0).
 * @param {number} [options.rate] - Override rate (0.1 to 2.0).
 * @param {string} [options.emotion] - Emotion key (calm, stressed, happy, sad, neutral).
 * @returns {Promise<void>} Resolves when speech finishes.
 */
function speak(text, options = {}) {
  const speakPromise = new Promise((resolve, reject) => {
    // Safety check: is SpeechSynthesis available?
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.error('[text-to-speech] SpeechSynthesis not available.');
      reject(new Error('SpeechSynthesis is not available in this browser.'));
      return;
    }

    // Cancel any speech already in progress — no overlapping
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Create the speech utterance (the "thing to say")
    const utterance = new SpeechSynthesisUtterance(text);

    // Apply the selected voice
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // ── Determine pitch and rate ───────────────────────────────
    // Priority: explicit options > emotion preset > defaults
    const emotion = options.emotion || 'neutral';
    const preset = EMOTION_PRESETS[emotion] || EMOTION_PRESETS.neutral;

    utterance.pitch = options.pitch ?? preset.pitch;
    utterance.rate = options.rate ?? preset.rate;
    utterance.volume = 1.0;

    let settled = false;
    function settleOnce(fn) {
      if (!settled) {
        settled = true;
        clearKeepalive();
        fn();
      }
    }

    // ── Event Handlers ─────────────────────────────────────────

    utterance.onstart = () => {
      speaking = true;
      startKeepalive();
      console.log('[text-to-speech] Speaking:', text.substring(0, 50) + (text.length > 50 ? '…' : ''));
      if (startCallback) {
        startCallback(text);
      }
    };

    utterance.onend = () => {
      speaking = false;
      settleOnce(() => {
        if (endCallback) {
          endCallback(text);
        }
        resolve();
      });
    };

    utterance.onerror = (event) => {
      speaking = false;

      // 'interrupted' and 'cancelled' happen when we call stop() — not real errors
      if (event.error === 'interrupted' || event.error === 'canceled') {
        settleOnce(() => resolve());
        return;
      }

      console.error('[text-to-speech] Error:', event.error);
      settleOnce(() => reject(new Error(`Speech synthesis error: ${event.error}`)));
    };

    // ── Speak! ─────────────────────────────────────────────────

    // Chrome has a bug where speechSynthesis can get "stuck" after being
    // idle. Calling cancel() then speak() with a small delay helps.
    window.speechSynthesis.cancel();
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  });

  // Watchdog: if onend never fires (Chrome bug for long utterances >15s),
  // force-resolve after WATCHDOG_TIMEOUT_MS and cancel the stuck speech.
  const watchdog = new Promise((resolve) => {
    setTimeout(() => {
      console.warn('[text-to-speech] Watchdog timeout — forcing end after', WATCHDOG_TIMEOUT_MS, 'ms');
      speaking = false;
      clearKeepalive();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (endCallback) {
        endCallback(text);
      }
      resolve();
    }, WATCHDOG_TIMEOUT_MS);
  });

  return Promise.race([speakPromise, watchdog]);
}

/**
 * Chrome drops the `onend` event for long utterances (>~15s).
 * Workaround: pulse pause/resume every 10s to keep the synth alive.
 */
function startKeepalive() {
  clearKeepalive();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    keepaliveTimer = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, KEEPALIVE_INTERVAL_MS);
  }
}

function clearKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

/**
 * Stop any speech currently in progress.
 */
function stop() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  speaking = false;
}

/**
 * Check if Dekel is currently speaking.
 *
 * @returns {boolean} True if speech is in progress.
 */
function isSpeaking() {
  return speaking;
}

/**
 * Register a callback for when speech starts.
 *
 * @param {function} cb - Called with the text being spoken.
 */
function onStart(cb) {
  startCallback = cb;
}

/**
 * Register a callback for when speech ends.
 *
 * @param {function} cb - Called with the text that was spoken.
 */
function onEnd(cb) {
  endCallback = cb;
}

// ── Exports ────────────────────────────────────────────────────────

export default {
  speak,
  stop,
  isSpeaking,
  onStart,
  onEnd
};

export {
  speak,
  stop,
  isSpeaking,
  onStart,
  onEnd
};
