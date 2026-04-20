export const ASSISTANT_STATES = Object.freeze({
  IDLE: 'idle',
  WAITING_FOR_WAKE_WORD: 'waiting_for_wake_word',
  WAKE_DETECTED: 'wake_detected',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  RETRY: 'retry',
  RETURN_TO_IDLE: 'return_to_idle',
  ERROR: 'error'
});

export const WAKE_PHRASE = 'hey medi';
export const WAKE_ENGINE = 'vosk';
export const TRANSCRIPTION_ENGINE = 'gpt-4o-transcribe';
export const ASSISTANT_MODEL = 'gpt-5';
export const MEDICAL_MODEL = 'gpt-5';
export const TTS_ENGINE = 'gpt-4o-mini-tts';
export const INTENT_CONFIDENCE_THRESHOLD = 0.75;
export const LANGUAGE_SESSION_STORAGE_KEY = 'mediassist.language_session.v1';
export const ASSISTANT_STATUS_EVENT_NAME = 'mediassist:status';
export const ASSISTANT_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const ASSISTANT_STREAMING_ENABLED = true;
export const LANGUAGE_CONFIDENCE_THRESHOLD = 0.6;
export const ASSISTANT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
export const ASSISTANT_RECOVERY_LIMITS = Object.freeze({
  wake_word: 1,
  transcription: 2,
  tts: 1
});
export const ASSISTANT_LATENCY_THRESHOLDS = Object.freeze({
  wakeWord: 800,
  transcription: 3000,
  intent: 3000,
  tts: 4000,
  totalResponse: 8000
});

export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', locale: 'en-US', label: 'English' },
  { code: 'hi', locale: 'hi-IN', label: 'Hindi' },
  { code: 'te', locale: 'te-IN', label: 'Telugu' },
  { code: 'ta', locale: 'ta-IN', label: 'Tamil' },
  { code: 'kn', locale: 'kn-IN', label: 'Kannada' },
  { code: 'ml', locale: 'ml-IN', label: 'Malayalam' }
]);
