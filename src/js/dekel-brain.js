/**
 * Dekel's Brain — Rule-Based Response Generator
 * 
 * Takes user input (text + detected emotion) and generates supportive, appropriate responses.
 * 
 * How to explain it to a kid:
 * "This is Dekel's thinking part. When you tell Dekel how you feel, this decides
 * what Dekel should say back to help you feel better or keep feeling good."
 * 
 * @module dekel-brain
 */

// Response templates for each emotion
const RESPONSE_TEMPLATES = {
  stressed: {
    high: [
      "I hear some tension in your voice. Take a slow breath with me. What's on your mind?",
      "You sound a bit stressed. Let's slow down for a moment. What's worrying you?",
      "I notice some pressure in your voice. I'm here to listen. What's going on?",
      "That sounds challenging. Take a deep breath. Want to talk about it?"
    ],
    medium: [
      "Things seem a bit intense. How are you managing?",
      "I hear something in your voice. Are you feeling stressed?",
      "You sound like you might have a lot on your mind. What's up?"
    ]
  },
  
  happy: {
    high: [
      "You sound great! Tell me more about what's making you happy.",
      "I love hearing that energy in your voice! What's going well?",
      "You sound wonderful! Share what's bringing you joy.",
      "That's fantastic! What's making today so good?"
    ],
    medium: [
      "You sound pretty good! What's on your mind?",
      "Things seem positive. Want to share what's happening?",
      "You sound upbeat. Tell me more!"
    ]
  },
  
  calm: {
    high: [
      "You seem relaxed. That's wonderful. What are you thinking about?",
      "You sound peaceful. I'm glad. What would you like to talk about?",
      "You seem centered. That's great to hear. What's on your mind?",
      "You sound very calm. It's nice to sense that balance. What's happening?"
    ],
    medium: [
      "You sound steady. How are things going?",
      "You seem pretty relaxed. What's up?",
      "Things sound calm. What would you like to discuss?"
    ]
  },
  
  sad: {
    high: [
      "I notice your voice is a bit low. I'm here to listen. What's going on?",
      "You sound like something's weighing on you. Want to talk about it?",
      "I hear some sadness. I'm here for you. What's happening?",
      "That sounds tough. I'm listening. What's on your mind?"
    ],
    medium: [
      "You sound a bit down. Are you okay?",
      "Something seems to be bothering you. Want to share?",
      "I hear something in your voice. What's going on?"
    ]
  },
  
  neutral: {
    high: [
      "I'm here to listen. What would you like to talk about?",
      "How are you doing today? What's on your mind?",
      "I'm here for you. What would you like to discuss?",
      "What's happening in your world right now?"
    ],
    medium: [
      "I'm here. What's on your mind?",
      "How are things going?",
      "What would you like to talk about?"
    ]
  }
};

// Low-confidence responses (when we're not sure about the emotion)
const UNCERTAIN_RESPONSES = [
  "I want to make sure I understand. How are you feeling right now?",
  "Tell me more about what's going on. How are you doing?",
  "I'm here to listen. What's happening with you?",
  "Help me understand. How are you feeling at this moment?",
  "I'm here for you. What's on your mind right now?"
];

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.65,
  MEDIUM: 0.45
};

/**
 * Generate a supportive response based on detected emotion and confidence
 * @param {Object} input - The input data
 * @param {string} input.text - What the user said (transcript)
 * @param {string} input.emotion - Detected emotion (calm, stressed, happy, sad, neutral)
 * @param {number} input.confidence - Confidence score (0-1)
 * @returns {Object} Response object with reply and emotion
 */
export function generateResponse({ text, emotion, confidence }) {
  console.log('[Dekel Brain] Generating response for:', { text, emotion, confidence });
  
  // If confidence is too low, ask for clarification
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
    const reply = getRandomItem(UNCERTAIN_RESPONSES);
    return {
      reply,
      emotion: 'neutral'
    };
  }
  
  // Determine confidence level
  const confidenceLevel = confidence >= CONFIDENCE_THRESHOLDS.HIGH ? 'high' : 'medium';
  
  // Get templates for this emotion
  const templates = RESPONSE_TEMPLATES[emotion] || RESPONSE_TEMPLATES.neutral;
  const responses = templates[confidenceLevel] || templates.high;
  
  // Select a random response
  const reply = getRandomItem(responses);
  
  // Dekel responds with a supportive, neutral emotion
  // (We could match the user's emotion, but responding calmly helps regulate)
  const responseEmotion = 'calm';
  
  return {
    reply,
    emotion: responseEmotion
  };
}

/**
 * Get a random item from an array
 * @private
 */
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Export both default and named
export default {
  generateResponse
};
