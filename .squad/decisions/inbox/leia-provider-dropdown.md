# Decision: API Provider Dropdown

**Author:** Leia (Frontend Dev)  
**Date:** 2025-07-17  

## Context
Users had to manually edit code to switch between LLM providers (OpenAI, Groq, etc). For an educational demo, this friction needed to go.

## Decision
- Added a `<select>` dropdown to the settings panel with three options: **OpenAI**, **Groq (Free)**, and **Custom**.
- **Groq is the default** because it's free — best for students and demos.
- When "Custom" is selected, additional endpoint URL and model name fields appear.
- Provider presets (`PROVIDERS`) live in `conversation-engine.js` as the single source of truth.
- `setProvider()` updates endpoint + model but **never overwrites the API key**.
- Provider choice is persisted in `sessionStorage` under `dekel-provider`.

## Files Changed
- `src/js/conversation-engine.js` — added `PROVIDERS`, `setProvider`, `getProvider`, `getProviders`
- `src/index.html` — added provider `<select>` and custom fields
- `src/js/ui.js` — cached new DOM elements, added `onProviderChange`, `setProvider`, `setApiKeyPlaceholder`
- `src/js/app.js` — wired up provider restore on init + change handler
- `src/css/styles.css` — styled the dropdown and custom fields
- `tests/conversation-engine.test.js` — added 13 tests for provider functionality

## Trade-offs
- Default model test updated from `gpt-4o-mini` to `llama-3.1-8b-instant` to reflect new groq default.
- Custom provider fields require user to also click Save on the API key to apply endpoint/model, keeping the flow simple and consistent.
