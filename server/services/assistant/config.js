const ASSISTANT_MODELS = Object.freeze({
  wakeWord: 'vosk',
  // Best transcription model for multilingual + Indic scripts.
  speechRecognition: process.env.OPENAI_MODEL_STT || 'gpt-4o-transcribe',
  // Intent classification: gpt-4o gives MUCH better multilingual instruction following than gpt-4o-mini.
  // Override OPENAI_MODEL_ASSISTANT to swap (e.g. 'gpt-4o-mini' for cost, 'gpt-5' for max quality).
  assistantLogic: process.env.OPENAI_MODEL_ASSISTANT || process.env.OPENAI_MODEL_NORMAL || 'gpt-4o',
  // Medical reasoning: gpt-5 with reasoning_effort='low' for fast OPD answers.
  // Override OPENAI_MODEL_MEDICAL=gpt-4o (faster, no reasoning) or set OPENAI_MEDICAL_REASONING_EFFORT=medium for deeper reasoning.
  medicalReasoning: process.env.OPENAI_MODEL_MEDICAL || 'gpt-5',
  medicalReasoningEffort: process.env.OPENAI_MEDICAL_REASONING_EFFORT || 'low',
  // Lowest-latency multilingual TTS available today.
  voiceOutput: process.env.OPENAI_MODEL_TTS || 'gpt-4o-mini-tts'
});

const intentExecutionThreshold = Number.parseFloat(process.env.ASSISTANT_INTENT_CONFIDENCE_THRESHOLD || '0.75');

const ASSISTANT_THRESHOLDS = Object.freeze({
  intentExecution: Number.isFinite(intentExecutionThreshold) ? intentExecutionThreshold : 0.75,
  languageConfidence: 0.6
});

const ASSISTANT_STATES = Object.freeze({
  IDLE: 'idle',
  WAITING_FOR_WAKE_WORD: 'waiting_for_wake_word',
  WAKE_DETECTED: 'wake_detected',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  RETURN_TO_IDLE: 'return_to_idle',
  ERROR: 'error'
});

const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' }
]);

const WAKE_PHRASE = 'Hey Medi';

module.exports = {
  ASSISTANT_MODELS,
  ASSISTANT_THRESHOLDS,
  ASSISTANT_STATES,
  SUPPORTED_LANGUAGES,
  WAKE_PHRASE
};
