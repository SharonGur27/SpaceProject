/**
 * UI Controller — DOM Manipulation and Event Handling
 * 
 * Manages all user interface elements and interactions.
 * 
 * How to explain it to a kid:
 * "This controls everything you see on the screen — the buttons you press,
 * the words that show up, and the emojis that tell you how you're feeling."
 * 
 * @module ui
 */

// DOM element references (initialized in initUI)
let elements = {};

// Emotion emoji mapping
const EMOTION_EMOJIS = {
  calm: '😌',
  stressed: '😰',
  happy: '😊',
  sad: '😔',
  neutral: '❓',
  uncertain: '❓'
};

// Status color mapping
const STATUS_COLORS = {
  ready: '#4CAF50',      // Green
  listening: '#2196F3',  // Blue
  processing: '#FF9800', // Orange
  speaking: '#9C27B0'    // Purple
};

/**
 * Initialize the UI and cache DOM references
 */
export function initUI() {
  console.log('[UI] Initializing...');
  
  // Cache all DOM elements
  elements = {
    talkButton: document.getElementById('talk-button'),
    status: document.getElementById('status'),
    transcriptArea: document.getElementById('transcript'),
    emotionIndicator: document.getElementById('emotion-indicator'),
    emotionEmoji: document.getElementById('emotion-emoji'),
    emotionLabel: document.getElementById('emotion-label'),
    emotionConfidence: document.getElementById('emotion-confidence'),
    responseArea: document.getElementById('response'),
    textInput: document.getElementById('text-input'),
    submitButton: document.getElementById('submit-button')
  };
  
  // Verify all elements exist
  const missing = Object.entries(elements)
    .filter(([key, el]) => !el)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    console.warn('[UI] Missing elements:', missing);
  }
  
  // Set initial state
  setStatus('ready');
  
  console.log('[UI] Ready');
}

/**
 * Set the current status and update the status indicator
 * @param {string} status - Status ('ready'|'listening'|'processing'|'speaking')
 */
export function setStatus(status) {
  if (!elements.status) return;
  
  const statusText = {
    ready: 'Ready to listen',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Speaking...'
  };
  
  elements.status.textContent = statusText[status] || status;
  elements.status.style.color = STATUS_COLORS[status] || '#fff';
  
  // Update button state
  if (elements.talkButton) {
    if (status === 'listening') {
      elements.talkButton.textContent = '🛑 Stop';
      elements.talkButton.classList.add('listening');
    } else {
      elements.talkButton.textContent = '🎤 Talk to Dekel';
      elements.talkButton.classList.remove('listening');
    }
    
    // Disable button during processing/speaking
    elements.talkButton.disabled = (status === 'processing' || status === 'speaking');
  }
}

/**
 * Set the transcript text
 * @param {string} text - The transcript text
 * @param {boolean} interim - Whether this is an interim result (default: false)
 */
export function setTranscript(text, interim = false) {
  if (!elements.transcriptArea) return;
  
  if (interim) {
    elements.transcriptArea.innerHTML = `${text}<span class="interim">...</span>`;
  } else {
    elements.transcriptArea.textContent = text;
  }
}

/**
 * Set the emotion indicator
 * @param {string} emotion - The emotion name
 * @param {number} confidence - Confidence score (0-1)
 */
export function setEmotion(emotion, confidence) {
  if (!elements.emotionIndicator) return;
  
  const emoji = EMOTION_EMOJIS[emotion] || EMOTION_EMOJIS.neutral;
  const confidencePercent = Math.round(confidence * 100);
  
  if (elements.emotionEmoji) {
    elements.emotionEmoji.textContent = emoji;
  }
  
  if (elements.emotionLabel) {
    elements.emotionLabel.textContent = emotion;
  }
  
  if (elements.emotionConfidence) {
    elements.emotionConfidence.textContent = `${confidencePercent}%`;
    
    // Color code confidence
    if (confidence >= 0.65) {
      elements.emotionConfidence.style.color = '#4CAF50'; // Green
    } else if (confidence >= 0.45) {
      elements.emotionConfidence.style.color = '#FF9800'; // Orange
    } else {
      elements.emotionConfidence.style.color = '#F44336'; // Red
    }
  }
  
  // Show the indicator
  elements.emotionIndicator.style.display = 'block';
}

/**
 * Set Dekel's response text
 * @param {string} text - The response text
 */
export function setResponse(text) {
  if (!elements.responseArea) return;
  
  elements.responseArea.textContent = text;
  elements.responseArea.style.display = 'block';
}

/**
 * Register a callback for the talk button toggle
 * @param {Function} callback - Called with (isStarting: boolean)
 */
export function onTalkToggle(callback) {
  if (!elements.talkButton) return;
  
  elements.talkButton.addEventListener('click', () => {
    const isListening = elements.talkButton.classList.contains('listening');
    callback(!isListening);
  });
}

/**
 * Register a callback for text input submission (fallback mode)
 * @param {Function} callback - Called with (text: string)
 */
export function onTextSubmit(callback) {
  if (!elements.submitButton || !elements.textInput) return;
  
  const submit = () => {
    const text = elements.textInput.value.trim();
    if (text) {
      callback(text);
      elements.textInput.value = '';
    }
  };
  
  elements.submitButton.addEventListener('click', submit);
  elements.textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submit();
  });
}

/**
 * Clear all dynamic content (transcript, emotion, response)
 */
export function clearContent() {
  if (elements.transcriptArea) {
    elements.transcriptArea.textContent = '';
  }
  if (elements.emotionIndicator) {
    elements.emotionIndicator.style.display = 'none';
  }
  if (elements.responseArea) {
    elements.responseArea.textContent = '';
    elements.responseArea.style.display = 'none';
  }
}

/**
 * Show an error message
 * @param {string} message - Error message
 */
export function showError(message) {
  if (elements.status) {
    elements.status.textContent = `⚠️ ${message}`;
    elements.status.style.color = '#F44336';
  }
}

// Export both default and named
export default {
  initUI,
  setStatus,
  setTranscript,
  setEmotion,
  setResponse,
  onTalkToggle,
  onTextSubmit,
  clearContent,
  showError
};
