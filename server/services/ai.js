const UnifiedAssistantService = require('./assistant/UnifiedAssistantService');
const { ASSISTANT_MODELS, SUPPORTED_LANGUAGES: ASSISTANT_LANGUAGES } = require('./assistant/config');

const COMPATIBILITY_FALLBACK = 'MediAssist AI is temporarily unavailable right now. Please try again shortly.';
const SUPPORTED_LANGUAGES = Object.freeze(
  Object.fromEntries(ASSISTANT_LANGUAGES.map((entry) => [entry.code, entry.label]))
);
const MODEL_MEDICAL = ASSISTANT_MODELS.medicalReasoning;
const MODEL_NORMAL = ASSISTANT_MODELS.assistantLogic;
const MODEL_STT = ASSISTANT_MODELS.speechRecognition;
const MODEL_TTS = ASSISTANT_MODELS.voiceOutput;

const compatibilityService = new UnifiedAssistantService({ logger: logAi });

function logAi(event, payload = {}) {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ai: event, ...payload }));
  } catch {
    console.log('ai_event', event, payload);
  }
}

function pickTtsVoice() {
  return process.env.OPENAI_TTS_VOICE || 'alloy';
}

function resolveLanguage(...candidates) {
  for (const candidate of candidates) {
    const code = String(candidate || '').slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES[code]) {
      return code;
    }
  }
  return 'en';
}

function extractMessage(input) {
  if (typeof input === 'string') {
    return input.trim();
  }
  if (!input || typeof input !== 'object') {
    return '';
  }
  return String(input.message || input.text || input.prompt || '').trim();
}

async function withLegacyCompatibility(feature, action, fallback = null) {
  try {
    logAi('legacy_ai_compatibility_call', { feature });
    return await action();
  } catch (error) {
    logAi('legacy_ai_compatibility_error', { feature, error: error.message });
    return fallback;
  }
}

async function warmupModel() {
  logAi('legacy_ai_compatibility_ready', {
    assistantModel: MODEL_NORMAL,
    medicalModel: MODEL_MEDICAL,
    sttModel: MODEL_STT,
    ttsModel: MODEL_TTS
  });
}

async function queryAI(prompt, options = {}) {
  const message = extractMessage(prompt);
  if (!message) {
    return null;
  }

  return withLegacyCompatibility(
    'queryAI',
    async () => compatibilityService.gateway.generateAssistantReply({
      message,
      conversationHistory: options.conversationHistory || [],
      language: resolveLanguage(options.language)
    }),
    null
  );
}

async function queryAssistant(prompt, options = {}) {
  return queryAI(prompt, options);
}

const queryOllama = queryAssistant;

async function detectLanguage(text) {
  return withLegacyCompatibility(
    'detectLanguage',
    async () => compatibilityService.gateway.detectLanguage(text),
    'en'
  );
}

async function translateText(text, targetLanguage) {
  return withLegacyCompatibility(
    'translateText',
    async () => compatibilityService.gateway.translateText(text, targetLanguage),
    text
  );
}

async function generateTriageAssessment(vitals = {}, options = {}) {
  return withLegacyCompatibility(
    'generateTriageAssessment',
    async () => {
      const result = await compatibilityService.triageVitals({
        vitals,
        language: resolveLanguage(options.language, options.lang)
      });
      return result.assessment;
    },
    COMPATIBILITY_FALLBACK
  );
}

async function generateDiagnosis(payload = {}, options = {}) {
  return withLegacyCompatibility(
    'generateDiagnosis',
    async () => {
      const result = await compatibilityService.generateConsultationDiagnosis({
        consultation: payload.consultation || payload,
        vitals: payload.vitals,
        history: payload.history,
        language: resolveLanguage(options.language, payload.language)
      });
      return result.rawResponse || result.aiDiagnosis.map((entry) => entry.condition).join('\n');
    },
    COMPATIBILITY_FALLBACK
  );
}

async function interpretLabResults(payload = {}, options = {}) {
  const input = Array.isArray(payload) ? { results: payload } : payload;
  return withLegacyCompatibility(
    'interpretLabResults',
    async () => compatibilityService.interpretLabResults({
      results: input.results || [],
      testName: input.testName || input.title || '',
      language: resolveLanguage(options.language, input.language)
    }),
    COMPATIBILITY_FALLBACK
  );
}

async function generateTreatmentPlan(payload = {}, options = {}) {
  return withLegacyCompatibility(
    'generateTreatmentPlan',
    async () => compatibilityService.generateTreatmentPlan({
      diagnosis: payload.diagnosis || payload.finalDiagnosis || payload,
      vitals: payload.vitals,
      history: payload.history,
      language: resolveLanguage(options.language, payload.language)
    }),
    COMPATIBILITY_FALLBACK
  );
}

async function chatWithAI(message, options = {}) {
  const text = extractMessage(message);
  if (!text) {
    return null;
  }

  return withLegacyCompatibility(
    'chatWithAI',
    async () => {
      if (options.consultation || options.context) {
        return compatibilityService.chatForConsultation({
          consultation: options.consultation || options.context,
          message: text,
          language: resolveLanguage(options.language)
        });
      }

      const result = await compatibilityService.processCommand({
        text,
        language: resolveLanguage(options.language),
        conversationHistory: options.conversationHistory || [],
        userId: options.userId
      });
      return result.response;
    },
    COMPATIBILITY_FALLBACK
  );
}

async function generatePatientHistorySummary(patientData = {}, options = {}) {
  return withLegacyCompatibility(
    'generatePatientHistorySummary',
    async () => compatibilityService.summarizePatientHistory(
      patientData,
      resolveLanguage(options.language, patientData.language)
    ),
    COMPATIBILITY_FALLBACK
  );
}

async function generateWellnessPlan(patientData = {}, options = {}) {
  return withLegacyCompatibility(
    'generateWellnessPlan',
    async () => compatibilityService.generateWellnessPlan(
      patientData,
      resolveLanguage(options.language, patientData.language)
    ),
    COMPATIBILITY_FALLBACK
  );
}

async function generateReferralLetter(details = {}, options = {}) {
  return withLegacyCompatibility(
    'generateReferralLetter',
    async () => compatibilityService.generateReferralLetter(
      details,
      resolveLanguage(options.language, details.language)
    ),
    COMPATIBILITY_FALLBACK
  );
}

async function transcribeAudio(audioBuffer, filename, language) {
  return withLegacyCompatibility(
    'transcribeAudio',
    async () => compatibilityService.gateway.transcribeAudio(
      audioBuffer,
      filename,
      resolveLanguage(language)
    ),
    null
  );
}

async function synthesizeSpeech(text, options = {}) {
  return withLegacyCompatibility(
    'synthesizeSpeech',
    async () => compatibilityService.gateway.synthesizeSpeech(text, {
      ...options,
      voice: options.voice || pickTtsVoice(),
      language: resolveLanguage(options.language)
    }),
    null
  );
}

warmupModel();

module.exports = {
  queryAssistant,
  queryOllama,
  queryAI,
  warmupModel,
  generateTriageAssessment,
  generateDiagnosis,
  interpretLabResults,
  generateTreatmentPlan,
  chatWithAI,
  generatePatientHistorySummary,
  generateWellnessPlan,
  generateReferralLetter,
  transcribeAudio,
  synthesizeSpeech,
  detectLanguage,
  translateText,
  pickTtsVoice,
  logAi,
  SUPPORTED_LANGUAGES,
  MODEL_MEDICAL,
  MODEL_NORMAL,
  MODEL_STT,
  MODEL_TTS
};
