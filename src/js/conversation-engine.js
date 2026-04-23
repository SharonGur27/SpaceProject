/**
 * Conversation Engine — LLM API Integration
 * 
 * Manages LLM API calls for generating contextual responses.
 * Maintains conversation history for multi-turn context.
 * Configurable API endpoint and key.
 * 
 * How to explain it to a kid:
 * "This is like Dekel's connection to a really smart assistant that helps
 * Dekel understand not just your feelings, but also the exact words you said
 * and what you really mean."
 * 
 * @module conversation-engine
 */

// Provider presets — easy switching between LLM backends
export const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    placeholder: 'sk-...'
  },
  groq: {
    name: 'Groq (Free)',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    placeholder: 'gsk_...'
  },
  custom: {
    name: 'Custom',
    endpoint: '',
    model: '',
    placeholder: 'your-api-key'
  }
};

// Configuration (set by the UI or environment)
let currentProvider = 'groq'; // default to free tier for educational demo
let apiKey = '';
let apiEndpoint = PROVIDERS.groq.endpoint;
let model = PROVIDERS.groq.model;

// Conversation history (last 10 turns)
const conversationHistory = [];
const MAX_HISTORY = 10;

// Simple keyword lists for rough text-sentiment detection (used to flag tone-text mismatches)
const NEGATIVE_KEYWORDS = [
  'sad', 'bad', 'not good', 'terrible', 'awful', 'worried', 'scared', 'lonely',
  'miss', 'hurt', 'struggle', 'difficult', 'hard', 'tired', 'exhausted',
  'stressed', 'anxious', 'upset', 'angry', 'frustrated', 'depressed', 'alone',
  'hopeless', 'helpless', 'confused', 'overwhelmed'
];
const POSITIVE_KEYWORDS = [
  'good', 'great', 'fine', 'happy', 'wonderful', 'amazing', 'excellent', 'love',
  'excited', 'glad', 'thankful', 'grateful', 'enjoying', 'fantastic', 'perfect',
  'awesome'
];
const POSITIVE_TONES = ['happy', 'calm'];
const NEGATIVE_TONES = ['sad', 'stressed'];

/**
 * Detect rough text sentiment from keywords.
 * Returns 'negative', 'positive', or 'neutral'.
 * @param {string} text
 * @returns {string}
 */
export function detectTextSentiment(text) {
  const lower = text.toLowerCase();
  const hasNeg = NEGATIVE_KEYWORDS.some(kw => lower.includes(kw));
  const hasPos = POSITIVE_KEYWORDS.some(kw => lower.includes(kw));
  if (hasNeg && !hasPos) return 'negative';
  if (hasPos && !hasNeg) return 'positive';
  if (hasNeg && hasPos) return 'mixed';
  return 'neutral';
}

/**
 * Build a mismatch note when text sentiment and voice tone conflict.
 * @param {string} textSentiment - 'positive', 'negative', 'mixed', or 'neutral'
 * @param {string} emotion - detected voice tone
 * @returns {string|null} A bracketed note, or null if no conflict
 */
export function buildMismatchNote(textSentiment, emotion) {
  const toneIsPositive = POSITIVE_TONES.includes(emotion);
  const toneIsNegative = NEGATIVE_TONES.includes(emotion);

  if (textSentiment === 'negative' && toneIsPositive) {
    return '[Note: words seem negative but tone reads positive — tone likely inaccurate, trust the words]';
  }
  if (textSentiment === 'positive' && toneIsNegative) {
    return '[Note: words seem positive but tone reads negative — check if masking]';
  }
  return null;
}

// System prompt that defines Dekel's personality
const SYSTEM_PROMPT = `You are Dekel, a supportive virtual psychologist for astronauts on a space station.
You are part of an educational demo, so keep your language friendly and understandable.

Priority rule — text vs. voice tone:
- The user's WORDS are always the primary signal. Respond to what they actually said.
- A [Voice tone hint] may follow the user's text. This comes from automated prosody analysis and can be inaccurate.
- If the tone is marked "uncertain" or has low confidence, give it very little weight.

Tone-text conflict handling (asymmetric rules):
- Sad/negative words + happy/calm tone → The tone is likely wrong. People rarely fake sadness. Respond to the sadness in their words.
- Happy/positive words + sad/stressed tone → This mismatch is clinically meaningful. The person may be masking real distress behind cheerful words. Gently check in, e.g.: "You say things are fine, but I sense something might be weighing on you. How are you really doing?"
- General principle: people rarely fake sadness, but often hide it behind cheerfulness. When in doubt, lean toward the more vulnerable signal.

Your response structure:
1. REFLECT + VALIDATE: Acknowledge what the person said and how they seem to be feeling.
   Example: "It sounds like this is frustrating, and you also seem a bit stressed."
2. RESPOND TO CONTENT (2-4 sentences): Refer to specifics the person mentioned. Offer a small helpful perspective or step.
3. ASK AN OPEN QUESTION to help them explore further.
   Example: "What part of this feels hardest right now?"

Techniques you use:
- Open questions (not yes/no questions)
- Affirmations ("That took courage to share")
- Reflective listening ("It sounds like...")
- Summarizing when appropriate

Style rules:
- Friendly, calm, not robotic
- Warm and thorough — take the space you need to fully reflect, validate, and explore. A typical response is 4-8 sentences
- Use simple language (understandable by a 12-year-old)
- Never diagnose or give medical advice
- Never tell the person what to feel
- Always validate before problem-solving
- You speak in first person as Dekel`;

/**
 * Configure the conversation engine
 * @param {Object} config - Configuration object
 * @param {string} config.apiKey - OpenAI API key
 * @param {string} [config.endpoint] - API endpoint (optional)
 * @param {string} [config.model] - Model name (optional)
 */
export function configure({ apiKey: key, endpoint, model: modelName }) {
  if (key) {
    apiKey = key;
    console.log('[Conversation Engine] API key configured');
  }
  if (endpoint) {
    apiEndpoint = endpoint;
    console.log('[Conversation Engine] Endpoint set to:', endpoint);
  }
  if (modelName) {
    model = modelName;
    console.log('[Conversation Engine] Model set to:', modelName);
  }
}

/**
 * Check if the engine is configured with an API key
 * @returns {boolean} True if API key is set
 */
export function isConfigured() {
  return apiKey.length > 0;
}

/**
 * Generate a response using the LLM
 * @param {Object} input - The input data
 * @param {string} input.text - What the user said (transcript)
 * @param {string} input.emotion - Detected emotion (calm, stressed, happy, sad, neutral)
 * @param {number} input.confidence - Confidence score (0-1)
 * @returns {Promise<Object>} Response object with reply and emotion
 * @throws {Error} If API call fails
 */
export async function generateResponse({ text, emotion, confidence }) {
  if (!isConfigured()) {
    throw new Error('API key not configured');
  }
  
  console.log('[Conversation Engine] Generating LLM response for:', { text, emotion, confidence });
  
  // Build the user message — text first (primary signal), tone second (noisy signal)
  const confidencePercent = Math.round(confidence * 100);
  const textSentiment = detectTextSentiment(text);
  let userMessage;
  if (confidence < 0.4) {
    // Low confidence — tone detection is unreliable, omit it entirely
    userMessage = `User: ${text}`;
  } else if (confidence <= 0.6) {
    // Medium confidence — include but mark as uncertain
    userMessage = `User: ${text}\n[Voice tone hint: "${emotion}", confidence: ${confidencePercent}% — uncertain, may not reflect actual feelings. Prioritize the words above.]`;
  } else {
    // Higher confidence — include as secondary signal
    userMessage = `User: ${text}\n[Voice tone hint: "${emotion}", confidence: ${confidencePercent}% — secondary signal from automated prosody analysis. The user's words are the primary signal.]`;
  }

  // Append mismatch note if tone and text sentiment conflict (only when tone is included)
  if (confidence >= 0.4) {
    const mismatchNote = buildMismatchNote(textSentiment, emotion);
    if (mismatchNote) {
      userMessage += `\n${mismatchNote}`;
    }
  }
  
  // Build messages array for the API
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];
  
  try {
    // Call the OpenAI API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 200, // Keep responses concise
        presence_penalty: 0.6, // Encourage variety
        frequency_penalty: 0.3 // Reduce repetition
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      throw new Error(`API error (${response.status}): ${errorMessage}`);
    }
    
    const data = await response.json();
    
    // Extract the assistant's reply
    const reply = data.choices?.[0]?.message?.content;
    
    if (!reply) {
      throw new Error('No reply in API response');
    }
    
    console.log('[Conversation Engine] LLM reply:', reply);
    
    // Add to conversation history
    addToHistory(userMessage, reply);
    
    // Dekel always responds calmly
    return {
      reply: reply.trim(),
      emotion: 'calm'
    };
    
  } catch (error) {
    console.error('[Conversation Engine] API call failed:', error);
    throw error;
  }
}

/**
 * Add a turn to the conversation history
 * @private
 */
function addToHistory(userMessage, assistantReply) {
  conversationHistory.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantReply }
  );
  
  // Keep only the last MAX_HISTORY turns (each turn is 2 messages: user + assistant)
  const maxMessages = MAX_HISTORY * 2;
  if (conversationHistory.length > maxMessages) {
    conversationHistory.splice(0, conversationHistory.length - maxMessages);
  }
  
  console.log(`[Conversation Engine] History: ${conversationHistory.length / 2} turns`);
}

/**
 * Get the conversation history
 * @returns {Array} Array of message objects
 */
export function getConversationHistory() {
  return [...conversationHistory];
}

/**
 * Clear the conversation history
 */
export function clearHistory() {
  conversationHistory.length = 0;
  console.log('[Conversation Engine] History cleared');
}

/**
 * Switch to a provider preset (updates endpoint + model, keeps API key)
 * @param {string} providerName - Key from PROVIDERS ('openai'|'groq'|'custom')
 */
export function setProvider(providerName) {
  const preset = PROVIDERS[providerName];
  if (!preset) {
    console.warn('[Conversation Engine] Unknown provider:', providerName);
    return;
  }
  currentProvider = providerName;
  if (preset.endpoint) {
    apiEndpoint = preset.endpoint;
  }
  if (preset.model) {
    model = preset.model;
  }
  console.log(`[Conversation Engine] Provider set to ${preset.name} (${apiEndpoint}, ${model})`);
}

/**
 * Get the current provider name
 * @returns {string} Current provider key
 */
export function getProvider() {
  return currentProvider;
}

/**
 * Get all available provider presets
 * @returns {Object} The PROVIDERS map
 */
export function getProviders() {
  return { ...PROVIDERS };
}

// Export both default and named
export default {
  configure,
  isConfigured,
  generateResponse,
  getConversationHistory,
  clearHistory,
  setProvider,
  getProvider,
  getProviders,
  detectTextSentiment,
  buildMismatchNote,
  PROVIDERS
};
