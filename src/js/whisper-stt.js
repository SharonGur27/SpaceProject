/**
 * whisper-stt.js — Whisper Speech-to-Text via Groq API
 *
 * Records audio from the microphone using the MediaRecorder API,
 * then sends it to Groq's Whisper endpoint for transcription.
 *
 * How to explain it to a kid:
 *   "This is a backup ear for Dekel. If the normal ear (Web Speech) has
 *    trouble hearing, this one records what you say and sends it to a
 *    super-smart listener in the cloud called Whisper."
 *
 * @module whisper-stt
 */

// ── Constants ──────────────────────────────────────────────────────

const WHISPER_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const LOG_PREFIX = '[Whisper-STT]';

// ── State ──────────────────────────────────────────────────────────

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Callback storage
let finalResultCallback = null;
let errorCallback = null;

// ── Public API ─────────────────────────────────────────────────────

/**
 * Check if Whisper STT is available.
 * Requires MediaRecorder support AND a stored Groq API key.
 *
 * @returns {boolean}
 */
function isSupported() {
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasApiKey = !!getApiKey();
  return hasMediaRecorder && hasApiKey;
}

/**
 * Start recording audio from the provided MediaStream.
 *
 * @param {MediaStream} mediaStream - The mic stream (from mic-input.js)
 */
function start(mediaStream) {
  if (!mediaStream) {
    console.error(LOG_PREFIX, 'No MediaStream provided');
    fireError(new Error('No microphone stream available for Whisper recording.'));
    return;
  }

  if (isRecording) {
    console.warn(LOG_PREFIX, 'Already recording — ignoring start()');
    return;
  }

  // Determine a supported MIME type
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    console.error(LOG_PREFIX, 'No supported audio MIME type found');
    fireError(new Error('Browser does not support a compatible audio format for Whisper.'));
    return;
  }

  audioChunks = [];

  try {
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
  } catch (e) {
    console.error(LOG_PREFIX, 'Could not create MediaRecorder:', e.message);
    fireError(new Error('Could not start audio recording: ' + e.message));
    return;
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.onerror = (event) => {
    console.error(LOG_PREFIX, 'MediaRecorder error:', event.error);
    fireError(new Error('Audio recording error: ' + (event.error?.message || 'unknown')));
  };

  mediaRecorder.start();
  isRecording = true;
  console.log(LOG_PREFIX, `Recording started (${mimeType})`);
}

/**
 * Stop recording and send audio to Whisper for transcription.
 * The transcript is delivered via the onFinalResult callback.
 *
 * @returns {Promise<void>}
 */
function stop() {
  if (!mediaRecorder || !isRecording) {
    console.warn(LOG_PREFIX, 'Not recording — ignoring stop()');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      isRecording = false;
      console.log(LOG_PREFIX, `Recording stopped. ${audioChunks.length} chunk(s) captured.`);

      if (audioChunks.length === 0) {
        console.warn(LOG_PREFIX, 'No audio data captured');
        fireError(new Error('No audio data was captured.'));
        resolve();
        return;
      }

      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];

      console.log(LOG_PREFIX, `Audio blob: ${(audioBlob.size / 1024).toFixed(1)} KB, type: ${mimeType}`);

      try {
        const transcript = await transcribeWithWhisper(audioBlob, mimeType);
        if (transcript && transcript.trim().length > 0) {
          console.log(LOG_PREFIX, 'Transcript:', transcript);
          if (finalResultCallback) {
            finalResultCallback(transcript.trim());
          }
        } else {
          console.warn(LOG_PREFIX, 'Empty transcript returned');
          fireError(new Error('Whisper returned an empty transcript. Please try speaking again.'));
        }
      } catch (err) {
        console.error(LOG_PREFIX, 'Transcription failed:', err.message);
        fireError(err);
      }

      resolve();
    };

    mediaRecorder.stop();
  });
}

/**
 * Register a callback for the final transcription result.
 * Same interface as speech-to-text.js.
 *
 * @param {function} cb - Called with the transcript string.
 */
function onFinalResult(cb) {
  finalResultCallback = cb;
}

/**
 * Register a callback for errors.
 * Same interface as speech-to-text.js.
 *
 * @param {function} cb - Called with an Error object.
 */
function onError(cb) {
  errorCallback = cb;
}

// ── Internal Helpers ───────────────────────────────────────────────

/**
 * Send audio to Groq's Whisper API for transcription.
 *
 * @param {Blob} audioBlob - The recorded audio
 * @param {string} mimeType - The MIME type of the audio
 * @returns {Promise<string>} The transcript text
 */
async function transcribeWithWhisper(audioBlob, mimeType) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('No API key configured. Please add your Groq API key in Settings.');
  }

  // Determine file extension from MIME type
  const ext = mimeTypeToExtension(mimeType);
  const fileName = `recording.${ext}`;

  const formData = new FormData();
  formData.append('file', audioBlob, fileName);
  formData.append('model', WHISPER_MODEL);
  formData.append('language', 'en');
  formData.append('response_format', 'json');

  console.log(LOG_PREFIX, `Sending ${(audioBlob.size / 1024).toFixed(1)} KB to Whisper (${WHISPER_MODEL})…`);

  const response = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    let errorMsg = `Whisper API error: ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMsg = errorBody.error?.message || errorMsg;
    } catch (_) {
      // Could not parse error body
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return data.text || '';
}

/**
 * Get the Groq API key from localStorage.
 * @returns {string|null}
 */
function getApiKey() {
  try {
    return localStorage.getItem('dekel-api-key');
  } catch (_) {
    return null;
  }
}

/**
 * Determine a supported audio MIME type for MediaRecorder.
 * Whisper accepts webm, mp4, wav, mp3, ogg, and more.
 * @returns {string|null}
 */
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4'
  ];

  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return null;
}

/**
 * Map a MIME type to a file extension Whisper recognizes.
 * @param {string} mimeType
 * @returns {string}
 */
function mimeTypeToExtension(mimeType) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Fire the error callback safely.
 * @param {Error} err
 */
function fireError(err) {
  if (errorCallback) {
    errorCallback(err);
  }
}

// ── Exports ────────────────────────────────────────────────────────

export default {
  start,
  stop,
  onFinalResult,
  onError,
  isSupported
};

export {
  start,
  stop,
  onFinalResult,
  onError,
  isSupported
};
