const OpenAI = require('openai');
const { ASSISTANT_MODELS } = require('./config');

const FALLBACK_MESSAGE = 'I can share general guidance, but I cannot provide a reliable medical answer right now. Please consult your doctor for clinical decisions.';

function buildTokenParams(model, maxTokens) {
  return /^gpt-5/i.test(String(model || ''))
    ? { max_completion_tokens: Math.max(maxTokens * 2, 512) }
    : { max_tokens: maxTokens };
}

function buildCompletionConfig(model, temperature, maxTokens) {
  return {
    ...buildTokenParams(model, maxTokens),
    ...(/^gpt-5/i.test(String(model || ''))
      ? { reasoning_effort: 'low' }
      : { temperature })
  };
}

class MedicalService {
  constructor({ apiKey, logger } = {}) {
    this.logger = logger;
    this.model = ASSISTANT_MODELS.medicalReasoning;
    this.client = apiKey || process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })
      : null;
  }

  buildSystemPrompt(language = 'English') {
    return `You are MediAssist, a cautious medical assistant for a hospital OPD workflow.
Always reply in ${language}.
Never switch languages mid-reply.
Keep answers concise, clear, and patient-friendly.
Do not provide definitive diagnoses.
Do not prescribe medication dosages.
When symptoms could be dangerous, explicitly advise urgent in-person medical care.
Prefer safe next steps, red flags, and plain-language explanation.`;
  }

  async complete(userPrompt, { language = 'English', maxTokens = 300 } = {}) {
    if (!this.client) {
      this.logger?.('medical_response_unavailable', { reason: 'missing_api_key' });
      return FALLBACK_MESSAGE;
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        ...buildCompletionConfig(this.model, 0.2, maxTokens),
        messages: [
          { role: 'system', content: this.buildSystemPrompt(language) },
          { role: 'user', content: userPrompt }
        ]
      });
      const content = response?.choices?.[0]?.message?.content?.trim();
      this.logger?.('medical_response_complete', { model: this.model, chars: content?.length || 0 });
      return content || FALLBACK_MESSAGE;
    } catch (error) {
      this.logger?.('medical_response_error', { model: this.model, error: error.message });
      return FALLBACK_MESSAGE;
    }
  }

  async *streamComplete(userPrompt, { language = 'English', maxTokens = 300 } = {}) {
    if (!this.client) {
      yield FALLBACK_MESSAGE;
      return;
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        ...buildCompletionConfig(this.model, 0.2, maxTokens),
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
      yield FALLBACK_MESSAGE;
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
