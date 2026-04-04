# Dekel — Product Requirements Document

> A supportive virtual psychologist for astronauts (educational prototype)

## Overview

We are building an educational prototype called "Dekel" – a supportive virtual psychologist for astronauts.
The solution must be simple, clear, and explainable.

This task focuses ONLY on the first subsystem:
**VOICE INPUT, SPEECH OUTPUT, AND EMOTION DETECTION FROM INPUT VOICE.**

## Context

- The system runs in a modern web browser (Chrome / Edge).
- Internet connection IS available.
- The solution should prioritize browser-based technologies.
- The goal is not clinical accuracy, but a working, understandable prototype.

## Requirements

### 1. Core Capabilities

Design and implement a browser-based solution that includes:
- Microphone input from the user
- Speech-to-text (if appropriate)
- Detection of emotional tone from voice (e.g., calm, stressed, happy)
- Text-to-speech output so "Dekel" can speak back

### 2. Emotion Detection

- Emotion should be inferred from voice tone / prosody, not only from the meaning of the words.
- Use a small, understandable set of emotions (such as, but not limited to: calm, stressed, happy).
- If you recommend a model (e.g., Teachable Machine, TensorFlow.js, or another approach), explain why.
- Assume models can be trained ahead of time if needed.

### 3. Implementation Constraints

- The solution must be explainable to children.
- Avoid overengineering.
- Prefer well-known browser APIs or lightweight JS libraries.
- Include fallback behavior if emotion detection is uncertain.

### 4. Deliverables

- A clear technical approach (architecture overview).
- Key technologies/APIs used (with justification).
- A minimal working example or pseudocode showing:
  - Listening
  - Emotion classification
  - Speaking a response
- A list of limitations and assumptions.

### 5. Communication Style

- Be clear and structured.
- Use simple explanations alongside technical ones.
- Assume the output will be reviewed by an adult mentor and explained to children.
