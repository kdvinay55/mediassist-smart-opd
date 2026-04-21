const ASSISTANT_MODELS = Object.freeze({
  wakeWord: 'vosk',
  speechRecognition: process.env.OPENAI_MODEL_STT || 'gpt-4o-transcribe',
  // gpt-4o-mini is far faster than gpt-5 for intent classification + chat
  // (sub-2s vs 20+s with gpt-5 reasoning), with equal accuracy for these tasks.
  assistantLogic: process.env.OPENAI_MODEL_ASSISTANT || process.env.OPENAI_MODEL_NORMAL || 'gpt-4o-mini',
  medicalReasoning: process.env.OPENAI_MODEL_MEDICAL || 'gpt-4o-mini',
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
