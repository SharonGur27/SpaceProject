/**
 * Dekel App Controller — Main Integration Layer
 * 
 * Orchestrates all modules and manages the conversation flow:
 * 1. User presses talk → start mic + STT + feature extraction
 * 2. User speaks → transcript updates + features accumulate
 * 3. User stops → send text + emotion to brain
 * 4. Brain replies → TTS speaks + UI updates
 * 5. Ready for next input
 * 
 * How to explain it to a kid:
 * "This is the conductor of the orchestra. It tells each part of Dekel when to start,
 * when to stop, and makes sure they all work together to help you."
 * 
 * @module app
 */

import * as mic from './mic-input.js';
import * as stt from './speech-to-text.js';
import * as tts from './text-to-speech.js';
import * as audioFeatures from './audio-features.js';
import * as emotionDetector from './emotion-detector.js';
import * as brain from './dekel-brain.js';
import * as ui from './ui.js';
import * as engine from './conversation-engine.js';
import * as whisperStt from './whisper-stt.js';

// App state
let isListening = false;
let currentTranscript = '';
let analyserNode = null;

// ── STT Strategy ───────────────────────────────────────────────────
// 'webspeech' | 'whisper' | 'auto' (default)
// In 'auto' mode, starts with Web Speech and switches to Whisper
// after 2+ network errors in a session.
let activeSttMode = 'webspeech';   // The mode actually in use right now
let webSpeechNetworkErrors = 0;    // Network error counter for auto-switch
const AUTO_SWITCH_THRESHOLD = 2;   // Switch after this many network errors

/**
 * Initialize the application
 */
async function init() {
  console.log('[App] Initializing Dekel...');
  
  // Initialize UI first
  ui.initUI();
  
  // Restore provider preference (default: groq since it's free)
  const storedProvider = localStorage.getItem('dekel-provider') || 'groq';
  engine.setProvider(storedProvider);
  ui.setProvider(storedProvider);
  ui.setApiKeyPlaceholder(engine.PROVIDERS[storedProvider]?.placeholder || 'your-api-key');
  
  // Check for stored API key and configure engine
  const storedKey = localStorage.getItem('dekel-api-key');
  if (storedKey) {
    engine.configure({ apiKey: storedKey });
    ui.setApiStatus('configured');
    console.log('[App] Restored API key from session');
  }
  
  // ── STT strategy selection ─────────────────────────────────────
  const sttPref = localStorage.getItem('dekel-stt-provider') || 'auto';
  initSttStrategy(sttPref);
  
  // Check that at least one STT path is usable
  if (!stt.isSupported() && !whisperStt.isSupported()) {
    ui.showError('No speech recognition available. Please use Chrome/Edge or configure a Groq API key.');
    console.error('[App] No STT backend available');
    return;
  }
  
  // Load emotion detection model
  ui.setStatus('Loading AI model...');
  try {
    await emotionDetector.loadModel();
    console.log('[App] Emotion model loaded successfully');
  } catch (error) {
    console.warn('[App] Could not load emotion model, using fallback:', error);
    // The emotion detector will automatically fall back to rule-based detection
  }
  
  // Set up event handlers
  setupEventHandlers();
  
  // Ready to go
  ui.setStatus('ready');
  console.log('[App] Ready!');
}

/**
 * Set up all event handlers
 */
function setupEventHandlers() {
  // Talk button toggle
  ui.onTalkToggle((isStarting) => {
    if (isStarting) {
      startListening();
    } else {
      stopListening();
    }
  });
  
  // Text input fallback
  ui.onTextSubmit(async (text) => {
    console.log('[App] Text fallback:', text);
    currentTranscript = text;
    ui.setTranscript(text);
    await processTranscript();
  });
  
  // API key configuration
  ui.onApiKeySubmit((key) => {
    console.log('[App] Configuring API key...');
    // If custom provider, also send custom endpoint/model
    if (engine.getProvider() === 'custom') {
      const endpoint = ui.getCustomEndpoint();
      const model = ui.getCustomModel();
      engine.configure({ apiKey: key, endpoint: endpoint || undefined, model: model || undefined });
    } else {
      engine.configure({ apiKey: key });
    }
    localStorage.setItem('dekel-api-key', key);
    ui.setApiStatus('configured');
    console.log('[App] API key configured and saved');
  });
  
  // Provider dropdown change
  ui.onProviderChange((providerName) => {
    console.log('[App] Provider changed to:', providerName);
    engine.setProvider(providerName);
    localStorage.setItem('dekel-provider', providerName);
    const preset = engine.PROVIDERS[providerName];
    if (preset) {
      ui.setApiKeyPlaceholder(preset.placeholder);
    }
  });
  
  // Clear history button
  ui.onClearHistory(() => {
    console.log('[App] Clearing conversation history...');
    engine.clearHistory();
    ui.clearConversationHistory();
  });
  
  // Mic events
  mic.onStreamReady((stream) => {
    console.log('[App] Microphone stream ready');
  });
  
  mic.onError((error) => {
    console.error('[App] Microphone error:', error);
    ui.showError(error.message);
    isListening = false;
    ui.setStatus('ready');
  });
  
  // STT events
  stt.onInterimResult((transcript) => {
    console.log('[App] Interim transcript:', transcript);
    currentTranscript = transcript;
    ui.setTranscript(transcript, true);
  });
  
  stt.onFinalResult((transcript) => {
    console.log('[App] Final transcript:', transcript);
    currentTranscript = transcript;
    ui.setTranscript(transcript, false);
  });
  
  // STT status changes (reconnecting, failed) — gives user feedback
  stt.onStatusChange((status) => {
    if (status.state === 'reconnecting') {
      const msg = status.maxAttempts
        ? `🔄 Reconnecting speech… (attempt ${status.attempt}/${status.maxAttempts})`
        : '🔄 Reconnecting speech…';
      console.log(`[App] STT reconnecting: ${status.reason} (attempt ${status.attempt})`);
      ui.setStatusText(msg, '#FF9800');
    }
    // 'failed' status is handled by the error callback below
  });

  stt.onError((error) => {
    console.error('[App] Speech recognition error:', error);
    // Don't show error UI for normal interruptions
    if (error.message.includes('aborted')) {
      return;
    }

    // Track network errors for auto-switch to Whisper
    if (error.message.includes('network')) {
      webSpeechNetworkErrors++;
      console.warn(`[App] Web Speech network error #${webSpeechNetworkErrors}`);

      if (activeSttMode === 'webspeech' && getSttPreference() === 'auto'
          && webSpeechNetworkErrors >= AUTO_SWITCH_THRESHOLD
          && whisperStt.isSupported()) {
        console.log(`[App] ⚡ Auto-switching to Whisper STT after ${webSpeechNetworkErrors} network errors`);
        activeSttMode = 'whisper';
        ui.setStatusText('🔄 Switched to Whisper (speech service unreliable)', '#FF9800');
      }
    }

    // All errors that reach here have exhausted retries (network) or
    // are non-recoverable (not-allowed, service-not-allowed)
    isListening = false;
    stt.stop();
    mic.stop();
    ui.setStatus('ready');
    cleanup();

    // Show appropriate message
    const permissionErrors = ['not-allowed', 'service-not-allowed'];
    const isPermission = permissionErrors.some(k => error.message.includes(k));

    if (isPermission || error.message.includes('network')) {
      ui.showSpeechUnavailable();
    } else {
      ui.showError(error.message);
    }
  });
  
  // Audio features events
  audioFeatures.onFeaturesReady((features) => {
    console.log('[App] Features extracted:', features);
    // Features are accumulated automatically, we'll use them when stopping
  });
  
  // TTS events
  tts.onStart(() => {
    console.log('[App] TTS started');
    ui.setStatus('speaking');
  });
  
  tts.onEnd(() => {
    console.log('[App] TTS ended');
    ui.setStatus('ready');
  });
}

/**
 * Start listening to user input.
 * Uses either Web Speech or Whisper depending on the active STT mode.
 */
async function startListening() {
  console.log('[App] Starting listening session…');
  console.log('[App]   app.isListening:', isListening, '  sttMode:', activeSttMode);
  
  try {
    isListening = true;
    ui.clearContent();
    ui.setStatus('listening');
    currentTranscript = '';
    
    // Start microphone
    await mic.start();
    console.log('[App]   mic started, audioContext state:', mic.getAudioContext()?.state);
    
    // Create analyser node for audio feature extraction
    const audioContext = mic.getAudioContext();
    const sourceNode = mic.getSourceNode();
    
    if (!audioContext || !sourceNode) {
      throw new Error('Audio context or source node not available');
    }
    
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
    
    // Connect: sourceNode → analyser → destination
    sourceNode.connect(analyserNode);
    // Note: We don't connect to destination to avoid feedback
    
    // Initialize audio feature extraction
    audioFeatures.init(analyserNode, audioContext);
    audioFeatures.startExtraction();
    
    // Start the appropriate STT engine
    if (activeSttMode === 'whisper') {
      // Whisper mode: record audio, transcribe on stop
      const stream = mic.getMediaStream();
      if (!stream) {
        throw new Error('No media stream available for Whisper recording');
      }
      whisperStt.start(stream);
      ui.setStatusText('🎙️ Recording…', '#2196F3');
      console.log('[App] Whisper recording started');
    } else {
      // Web Speech mode: live recognition
      await new Promise(resolve => setTimeout(resolve, 100));
      stt.start();
    }
    
    console.log('[App] Listening session started');
  } catch (error) {
    console.error('[App] Failed to start listening:', error);
    ui.showError(error.message);
    isListening = false;
    ui.setStatus('ready');
    
    // Clean up
    cleanup();
  }
}

/**
 * Stop listening and process the input.
 * For Whisper mode, waits for the API transcription before processing.
 */
async function stopListening() {
  console.log('[App] Stopping listening session...');
  
  if (!isListening) return;
  
  isListening = false;
  ui.setStatus('processing');
  
  try {
    // Save features BEFORE stopping — stopExtraction() resets latestFeatures to null
    const savedFeatures = audioFeatures.getLatestFeatures();
    
    // Stop audio capture
    audioFeatures.stopExtraction();

    if (activeSttMode === 'whisper') {
      // Whisper mode: stop recording → triggers API call → callback delivers transcript
      stt.stop(); // stop Web Speech if it was running (no-op if not)
      await whisperStt.stop();
      mic.stop();
    } else {
      // Web Speech mode: transcript already in currentTranscript from callbacks
      stt.stop();
      mic.stop();
    }
    
    // Process the transcript with the saved features
    await processTranscript(savedFeatures);
    
  } catch (error) {
    console.error('[App] Error during processing:', error);
    ui.showError('Sorry, something went wrong.');
  } finally {
    cleanup();
    // Backstop: always return to ready so the button is never stuck
    ui.setStatus('ready');
  }
}

/**
 * Process the transcript and generate a response
 */
async function processTranscript(savedFeatures) {
  if (!currentTranscript || currentTranscript.trim().length === 0) {
    console.log('[App] No transcript to process');
    ui.setStatus('ready');
    ui.showError('I didn\'t catch that. Please try again.');
    return;
  }
  
  console.log('[App] Processing transcript:', currentTranscript);
  
  try {
    // Get audio features — use saved features if provided, otherwise try latest
    const features = savedFeatures || audioFeatures.getLatestFeatures();
    console.log('[App] Using features:', features);
    
    // Detect emotion from audio features
    let emotion = 'neutral';
    let confidence = 0.5;
    
    if (features && features.length === 6) {
      const prediction = await emotionDetector.predict(features);
      emotion = prediction.emotion;
      confidence = prediction.confidence;
      console.log('[App] Emotion detected:', { emotion, confidence });
      
      // Update UI with emotion
      ui.setEmotion(emotion, confidence);
    } else {
      console.warn('[App] Invalid features, using neutral emotion');
      ui.setEmotion('neutral', 0.5);
    }
    
    // Generate response using Dekel's brain (now async)
    const response = await brain.generateResponse({
      text: currentTranscript,
      emotion: emotion,
      confidence: confidence
    });
    
    console.log('[App] Generated response:', response);
    
    // Display response and add to history
    ui.setResponse(response.reply);
    ui.addToHistory('dekel', response.reply);
    
    // Show response source indicator
    if (response.source === 'fallback') {
      ui.setResponseSource('fallback', response.fallbackReason);
    } else {
      ui.setResponseSource('llm');
    }
    
    // Speak response
    await tts.speak(response.reply, { emotion: response.emotion });
    
    // After speaking, return to ready state
    // (TTS onEnd handler will update status)
    
  } catch (error) {
    console.error('[App] Error processing transcript:', error);
    ui.showError('Sorry, I had trouble understanding that.');
    ui.setStatus('ready');
  }
}

/**
 * Clean up resources
 */
function cleanup() {
  if (analyserNode) {
    try {
      analyserNode.disconnect();
    } catch (e) {
      // Ignore if already disconnected
    }
    analyserNode = null;
  }
}

// ── STT Strategy Helpers ───────────────────────────────────────────

/**
 * Read the user's STT provider preference from localStorage.
 * @returns {'webspeech'|'whisper'|'auto'}
 */
function getSttPreference() {
  return localStorage.getItem('dekel-stt-provider') || 'auto';
}

/**
 * Initialize STT strategy based on preference.
 * Sets up Whisper callbacks and determines the active mode.
 *
 * @param {'webspeech'|'whisper'|'auto'} preference
 */
function initSttStrategy(preference) {
  console.log(`[App] STT strategy: ${preference}`);

  // Wire up Whisper callbacks (idempotent)
  whisperStt.onFinalResult((transcript) => {
    console.log('[App] Whisper transcript:', transcript);
    currentTranscript = transcript;
    ui.setTranscript(transcript, false);
  });

  whisperStt.onError((error) => {
    console.error('[App] Whisper error:', error.message);
    ui.showError(error.message);
  });

  // Determine active mode
  if (preference === 'whisper') {
    if (whisperStt.isSupported()) {
      activeSttMode = 'whisper';
      console.log('[App] Using Whisper STT (user preference)');
    } else {
      console.warn('[App] Whisper requested but not available (no API key?). Falling back to Web Speech.');
      activeSttMode = 'webspeech';
    }
  } else if (preference === 'webspeech') {
    activeSttMode = 'webspeech';
    console.log('[App] Using Web Speech STT (user preference)');
  } else {
    // 'auto' — start with Web Speech, switch on failure
    activeSttMode = stt.isSupported() ? 'webspeech' : 'whisper';
    console.log(`[App] Auto mode — starting with ${activeSttMode}`);
  }

  webSpeechNetworkErrors = 0;
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for potential testing
export default {
  init,
  startListening,
  stopListening
};
