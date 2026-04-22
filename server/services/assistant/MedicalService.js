const OpenAI = require('openai');
const { ASSISTANT_MODELS } = require('./config');

const FALLBACK_BY_LANG = {
  "English": "I can share general guidance, but I cannot provide a reliable medical answer right now. Please consult your doctor for clinical decisions.",
  "Hindi": "मैं सामान्य जानकारी दे सकता हूँ, पर अभी एक भरोसेमंद चिकित्सीय उत्तर नहीं दे पा रहा। कृपया अपने डॉक्टर से सलाह लें।",
  "Telugu": "నేను సాధారణ సమాచారం ఇవ్వగలను, కానీ ఇప్పుడు నమ్మదగిన వైద్య సమాధానం ఇవ్వలేకపోతున్నాను. దయచేసి మీ డాక్టర్‌ను సంప్రదించండి.",
  "Tamil": "நான் பொதுவான தகவலை வழங்க முடியும், ஆனால் தற்போது நம்பகமான மருத்துவ பதிலை வழங்க முடியவில்லை. தயவுசெய்து உங்கள் மருத்துவரை அணுகவும்.",
  "Kannada": "ನಾನು ಸಾಮಾನ್ಯ ಮಾಹಿತಿ ನೀಡಬಲ್ಲೆ, ಆದರೆ ಈಗ ವಿಶ್ವಾಸಾರ್ಹ ವೈದ್ಯಕೀಯ ಉತ್ತರ ನೀಡಲಾಗುತ್ತಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  "Malayalam": "എനിക്ക് പൊതുവായ വിവരങ്ങൾ നൽകാനാകും, പക്ഷേ ഇപ്പോൾ വിശ്വസനീയമായ ഒരു മെഡിക്കൽ ഉത്തരം നൽകാനാകുന്നില്ല. ദയവായി നിങ്ങളുടെ ഡോക്ടറെ സമീപിക്കുക."
};

function fallbackFor(language) {
  return FALLBACK_BY_LANG[language] || FALLBACK_BY_LANG.English;
}

function buildTokenParams(model, maxTokens) {
  return /^gpt-5/i.test(String(model || ''))
    ? { max_completion_tokens: Math.max(maxTokens * 2, 512) }
    : { max_tokens: maxTokens };
}

function buildCompletionConfig(model, temperature, maxTokens, reasoningEffort) {
  return {
    ...buildTokenParams(model, maxTokens),
    ...(/^gpt-5/i.test(String(model || ''))
      ? { reasoning_effort: reasoningEffort || 'low' }
      : { temperature })
  };
}

class MedicalService {
  constructor({ apiKey, logger } = {}) {
    this.logger = logger;
    this.model = ASSISTANT_MODELS.medicalReasoning;
    this.reasoningEffort = ASSISTANT_MODELS.medicalReasoningEffort || 'low';
    if (!MedicalService._keepAliveAgent) {
      const https = require('https');
      MedicalService._keepAliveAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50
      });
    }
    this.client = apiKey || process.env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: apiKey || process.env.OPENAI_API_KEY,
          httpAgent: MedicalService._keepAliveAgent,
          timeout: 60000,
          maxRetries: 1
        })
      : null;
  }

  buildSystemPrompt(language = 'English') {
    return `You are MediAssist, a warm and knowledgeable medical assistant at SRM Hospital.
Reply in ${language}. Match the language of the user's question. If the patient writes in mixed language (Tenglish, Hinglish), respond the same way.
Be conversational and caring like a helpful nurse explaining things to a patient, not a textbook.

Guidelines:
- Explain what their symptoms likely mean in simple everyday words
- Suggest practical home remedies they can try right now (warm water, rest, specific foods, etc.)
- Mention common OTC medicines by name when safe (paracetamol for fever, ORS for dehydration, etc.)
- Clearly flag dangerous symptoms that need immediate hospital visit (chest pain, breathing difficulty, high fever >103F, etc.)
- Keep it short and actionable (3-4 sentences max)
- End with a brief reassurance, not a scary "consult doctor immediately" unless truly urgent
- NEVER just say "please consult a doctor" without giving any useful information first`;
  }

  async complete(userPrompt, { language = 'English', maxTokens = 600 } = {}) {
    if (!this.client) {
      this.logger?.('medical_response_unavailable', { reason: 'missing_api_key' });
      return fallbackFor(language);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        ...buildCompletionConfig(this.model, 0.2, maxTokens, this.reasoningEffort),
        messages: [
          { role: 'system', content: this.buildSystemPrompt(language) },
          { role: 'user', content: userPrompt }
        ]
      });
      const content = response?.choices?.[0]?.message?.content?.trim();
      this.logger?.('medical_response_complete', { model: this.model, chars: content?.length || 0 });
      return content || fallbackFor(language);
    } catch (error) {
      this.logger?.('medical_response_error', { model: this.model, error: error.message });
      return fallbackFor(language);
    }
  }

  async *streamComplete(userPrompt, { language = 'English', maxTokens = 600 } = {}) {
    if (!this.client) {
      yield fallbackFor(language);
      return;
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        ...buildCompletionConfig(this.model, 0.2, maxTokens, this.reasoningEffort),
        stream: true,
        messages: [
          { role: 'system', content: this.buildSystemPrompt(language) },
          { role: 'user', content: userPrompt }
        ]
      });

      for await (const chunk of stream) {
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          yield delta;
        }
      }
    } catch (error) {
      this.logger?.('medical_response_error', { model: this.model, error: error.message });
      yield fallbackFor(language);
    }
  }

  async explainLabResults({ labSummary, language = 'English' }) {
    return this.complete(
      `Explain these lab results in simple, patient-friendly language. Mention what looks normal, what may be abnormal, and when the patient should speak to a doctor.\n\nLab summary:\n${labSummary}`,
      { language }
    );
  }

  async summarizePatientHistory({ patientHistory, language = 'English' }) {
    return this.complete(
      `Summarize this patient history for a patient-facing assistant. Focus on active issues, recent events, and follow-up needs.\n\nHistory:\n${patientHistory}`,
      { language }
    );
  }

  async provideGuidance({ message, context = '', language = 'English' }) {
    return this.complete(
      `Provide safe, non-diagnostic medical guidance for the patient's question. Include red flags when relevant.\n\nContext:\n${context}\n\nPatient question:\n${message}`,
      { language }
    );
  }

  async *streamGuidance({ message, context = '', language = 'English' }) {
    yield* this.streamComplete(
      `Provide safe, non-diagnostic medical guidance for the patient's question. Include red flags when relevant.\n\nContext:\n${context}\n\nPatient question:\n${message}`,
      { language }
    );
  }
}

module.exports = MedicalService;
