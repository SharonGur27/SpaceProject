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

// Configuration (set by the UI or environment)
let apiKey = '';
let apiEndpoint = 'https://api.openai.com/v1/chat/completions';
let model = 'gpt-4o-mini'; // cost-effective for a demo

// Conversation history (last 10 turns)
const conversationHistory = [];
const MAX_HISTORY = 10;

// System prompt that defines Dekel's personality
const SYSTEM_PROMPT = `You are Dekel, a supportive virtual psychologist for astronauts on a space station.
You are part of an educational demo, so keep your language friendly and understandable.

Your response structure:
1. REFLECT + VALIDATE: Acknowledge what the person said and how they seem to be feeling.
   Example: "It sounds like this is frustrating, and you also seem a bit stressed."
2. RESPOND TO CONTENT (1-2 sentences): Refer to specifics the person mentioned. Offer a small helpful perspective or step.
3. ASK AN OPEN QUESTION to help them explore further.
   Example: "What part of this feels hardest right now?"

Techniques you use:
- Open questions (not yes/no questions)
- Affirmations ("That took courage to share")
- Reflective listening ("It sounds like...")
- Summarizing when appropriate

Style rules:
- Friendly, calm, not robotic
- Concise — keep responses to 3-4 sentences max
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
  
  // Build the user message with emotion context
  const confidencePercent = Math.round(confidence * 100);
  const userMessage = `[Voice tone: ${emotion}, confidence: ${confidencePercent}%]\nUser: ${text}`;
  
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

// Export both default and named
export default {
  configure,
  isConfigured,
  generateResponse,
  getConversationHistory,
  clearHistory
};
