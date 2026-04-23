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

// Callbacks
let apiKeySubmitCallback = null;
let clearHistoryCallback = null;
let providerChangeCallback = null;

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
    submitButton: document.getElementById('submit-button'),
    apiKeyInput: document.getElementById('api-key-input'),
    saveApiKeyButton: document.getElementById('save-api-key'),
    apiStatus: document.getElementById('api-status'),
    conversationHistory: document.getElementById('conversation-history'),
    clearHistoryButton: document.getElementById('clear-history'),
    providerSelect: document.getElementById('provider-select'),
    customProviderFields: document.getElementById('custom-provider-fields'),
    customEndpoint: document.getElementById('custom-endpoint'),
    customModel: document.getElementById('custom-model')
  };
  
  // Verify all elements exist
  const missing = Object.entries(elements)
    .filter(([key, el]) => !el)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    console.warn('[UI] Missing elements:', missing);
  }
  
  // Set up API key save button
  if (elements.saveApiKeyButton && elements.apiKeyInput) {
    elements.saveApiKeyButton.addEventListener('click', () => {
      const key = elements.apiKeyInput.value.trim();
      if (key && apiKeySubmitCallback) {
        apiKeySubmitCallback(key);
        elements.apiKeyInput.value = ''; // Clear input for security
      }
    });
  }
  
  // Set up clear history button
  if (elements.clearHistoryButton) {
    elements.clearHistoryButton.addEventListener('click', () => {
      if (clearHistoryCallback) {
        clearHistoryCallback();
      }
    });
  }
  
  // Set up provider select
  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', () => {
      const value = elements.providerSelect.value;
      toggleCustomFields(value === 'custom');
      if (providerChangeCallback) {
        providerChangeCallback(value);
      }
    });
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
    // When final transcript is set, add to conversation history
    if (text.trim()) {
      addToHistory('user', text);
    }
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
 * Add a message to the conversation history
 * @param {string} role - 'user' or 'dekel'
 * @param {string} text - The message text
 */
export function addToHistory(role, text) {
  if (!elements.conversationHistory) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  
  const labelSpan = document.createElement('span');
  labelSpan.className = 'chat-label';
  labelSpan.textContent = role === 'user' ? 'You' : 'Dekel';
  
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  textSpan.textContent = text;
  
  messageDiv.appendChild(labelSpan);
  messageDiv.appendChild(textSpan);
  
  elements.conversationHistory.appendChild(messageDiv);
  
  // Auto-scroll to bottom
  elements.conversationHistory.scrollTop = elements.conversationHistory.scrollHeight;
}

/**
 * Clear the conversation history display
 */
export function clearConversationHistory() {
  if (!elements.conversationHistory) return;
  elements.conversationHistory.innerHTML = '';
}

/**
 * Set the API configuration status
 * @param {string} status - 'configured' or 'not_configured'
 */
export function setApiStatus(status) {
  if (!elements.apiStatus) return;
  
  if (status === 'configured') {
    elements.apiStatus.textContent = '✓ Configured';
    elements.apiStatus.style.color = '#4CAF50';
  } else {
    elements.apiStatus.textContent = 'Not configured';
    elements.apiStatus.style.color = '#9ca3af';
  }
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
 * Register a callback for API key submission
 * @param {Function} callback - Called with (apiKey: string)
 */
export function onApiKeySubmit(callback) {
  apiKeySubmitCallback = callback;
}

/**
 * Register a callback for clearing conversation history
 * @param {Function} callback - Called when clear button is clicked
 */
export function onClearHistory(callback) {
  clearHistoryCallback = callback;
}

/**
 * Register a callback for provider dropdown changes
 * @param {Function} callback - Called with (providerName: string)
 */
export function onProviderChange(callback) {
  providerChangeCallback = callback;
}

/**
 * Set the selected provider in the dropdown and toggle custom fields
 * @param {string} name - Provider key ('openai'|'groq'|'custom')
 */
export function setProvider(name) {
  if (elements.providerSelect) {
    elements.providerSelect.value = name;
    toggleCustomFields(name === 'custom');
  }
}

/**
 * Update the API key input placeholder text
 * @param {string} placeholder - New placeholder text
 */
export function setApiKeyPlaceholder(placeholder) {
  if (elements.apiKeyInput) {
    elements.apiKeyInput.placeholder = placeholder;
  }
}

/**
 * Get the custom endpoint value
 * @returns {string} Custom endpoint URL
 */
export function getCustomEndpoint() {
  return elements.customEndpoint ? elements.customEndpoint.value.trim() : '';
}

/**
 * Get the custom model value
 * @returns {string} Custom model name
 */
export function getCustomModel() {
  return elements.customModel ? elements.customModel.value.trim() : '';
}

/**
 * Show or hide the custom provider fields
 * @private
 */
function toggleCustomFields(show) {
  if (elements.customProviderFields) {
    elements.customProviderFields.style.display = show ? 'block' : 'none';
  }
}

/**
 * Set a custom status message with a specific color.
 * Use this for one-off messages like "Reconnecting…" that don't
 * correspond to a standard app state.
 *
 * @param {string} text - The status text to display
 * @param {string} [color='#fff'] - CSS color for the text
 */
export function setStatusText(text, color = '#fff') {
  if (!elements.status) return;
  elements.status.textContent = text;
  elements.status.style.color = color;
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
  // Defensive: ensure button is reset to non-listening state
  if (elements.talkButton) {
    elements.talkButton.textContent = '🎤 Talk to Dekel';
    elements.talkButton.classList.remove('listening');
    elements.talkButton.disabled = false;
  }

  if (elements.status) {
    elements.status.textContent = `⚠️ ${message}`;
    elements.status.style.color = '#F44336';
  }
}

/**
 * Show indicator of response source (LLM or fallback template)
 * @param {string} source - 'llm' or 'fallback'
 * @param {string} [reason] - Why fallback was used (error message)
 */
export function setResponseSource(source, reason) {
  if (!elements.status) return;
  
  if (source === 'llm') {
    elements.status.textContent = '🤖 Dekel responded (AI)';
    elements.status.style.color = '#4CAF50';
  } else {
    const hint = reason ? ` — ${reason}` : '';
    elements.status.textContent = `📝 Dekel responded (template${hint})`;
    elements.status.style.color = '#FF9800';
  }
}

/**
 * Show a friendly message when speech recognition is unavailable,
 * and guide the user to type instead.
 * @param {string} [message] - Optional custom message
 */
export function showSpeechUnavailable(message) {
  const fallbackMsg = message ||
    '🎤 Speech unavailable — type your message below!';

  // Defensive: ensure button is reset to non-listening state
  if (elements.talkButton) {
    elements.talkButton.textContent = '🎤 Talk to Dekel';
    elements.talkButton.classList.remove('listening');
    elements.talkButton.disabled = false;
  }

  // Show in the response area so it's prominent
  if (elements.responseArea) {
    elements.responseArea.textContent = fallbackMsg;
    elements.responseArea.style.display = 'block';
  }

  // Also update the status bar
  if (elements.status) {
    elements.status.textContent = fallbackMsg;
    elements.status.style.color = '#FF9800';
  }

  // Focus the text input so the user knows where to type
  if (elements.textInput) {
    elements.textInput.focus();
    elements.textInput.placeholder = 'Type your message here...';
  }
}

// Export both default and named
export default {
  initUI,
  setStatus,
  setStatusText,
  setTranscript,
  setEmotion,
  setResponse,
  addToHistory,
  clearConversationHistory,
  setApiStatus,
  onTalkToggle,
  onTextSubmit,
  onApiKeySubmit,
  onClearHistory,
  onProviderChange,
  setProvider,
  setApiKeyPlaceholder,
  getCustomEndpoint,
  getCustomModel,
  clearContent,
  showError,
  setResponseSource,
  showSpeechUnavailable
};
