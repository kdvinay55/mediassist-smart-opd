const OpenAI = require('openai');
const { ASSISTANT_MODELS, SUPPORTED_LANGUAGES } = require('./config');

const LANGUAGE_SCRIPTS = Object.freeze({
  te: /[\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  en: /[A-Za-z]/
});

function inferAudioMimeType(filename = '') {
  const normalized = String(filename || '').toLowerCase();
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.m4a')) return 'audio/mp4';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/webm';
}

function normalizeLanguageCode(code, fallback = 'en') {
  const normalized = String(code || '').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.some((entry) => entry.code === normalized) ? normalized : fallback;
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(Math.max(0, Math.min(0.99, value)).toFixed(2));
}

function textShowsLanguage(text, language) {
  const normalizedLanguage = normalizeLanguageCode(language, '');
  const matcher = LANGUAGE_SCRIPTS[normalizedLanguage];
  return Boolean(matcher && matcher.test(String(text || '')));
}

function inferLanguageFromScript(text) {
  if (!text) return 'en';
  const ranges = Object.entries(LANGUAGE_SCRIPTS).filter(([code]) => code !== 'en');

  for (const [code, pattern] of ranges) {
    if (pattern.test(text)) return code;
  }
  return 'en';
}

function buildTranslationMode(language, confidenceScore, detectionMode) {
  if (detectionMode === 'automatic' || confidenceScore < 0.6) {
    return 'automatic_detection';
  }
  return normalizeLanguageCode(language) === 'en'
    ? 'native'
    : 'same_language_response';
}

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

function scoreLanguageConfidence({ text, detectedLanguage, languageHint }) {
  const normalizedLanguage = normalizeLanguageCode(detectedLanguage);
  const normalizedHint = normalizeLanguageCode(languageHint, '');
  let score = normalizedLanguage ? 0.72 : 0.4;

  if (textShowsLanguage(text, normalizedLanguage)) {
    score += 0.18;
  }

  if (normalizedHint) {
    score += normalizedHint === normalizedLanguage ? 0.08 : -0.22;
  }

  if (String(text || '').trim().length < 12) {
    score -= 0.1;
  }

  return clampConfidence(score);
}

class OpenAIAssistantGateway {
  constructor({ apiKey, logger } = {}) {
    this.logger = logger;
    this.client = apiKey || process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })
      : null;
    this.assistantModel = ASSISTANT_MODELS.assistantLogic;
    this.transcriptionModel = ASSISTANT_MODELS.speechRecognition;
    this.ttsModel = ASSISTANT_MODELS.voiceOutput;
    this.languageMap = Object.fromEntries(SUPPORTED_LANGUAGES.map((entry) => [entry.code, entry.label]));
  }

  async complete({ model = this.assistantModel, systemPrompt, userPrompt, temperature = 0.2, maxTokens = 180 } = {}) {
    if (!this.client) {
      return null;
    }

    const response = await this.client.chat.completions.create({
      model,
      ...buildCompletionConfig(model, temperature, maxTokens),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    return response?.choices?.[0]?.message?.content?.trim() || null;
  }

  async *streamComplete({ model = this.assistantModel, systemPrompt, userPrompt, temperature = 0.2, maxTokens = 180 } = {}) {
    if (!this.client) {
      return;
    }

    const stream = await this.client.chat.completions.create({
      model,
      ...buildCompletionConfig(model, temperature, maxTokens),
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        yield delta;
      }
    }
  }

  async detectLanguage(text, preferredLanguage) {
    if (!text) return 'en';
    if (!this.client) return inferLanguageFromScript(text);

    try {
      const supported = Object.keys(this.languageMap).join(', ');
      const reply = await this.complete({
        systemPrompt: 'Detect the dominant language. Reply with one two-letter ISO-639-1 code only. Prefer the actual input text over any previous session language.',
        userPrompt: `Supported codes: ${supported}.\nPrevious session language: ${normalizeLanguageCode(preferredLanguage, 'unknown')}.\n\nText:\n${text}`,
        temperature: 0,
        maxTokens: 6
      });
      const code = (reply || '').slice(0, 2).toLowerCase();
      return this.languageMap[code] ? code : inferLanguageFromScript(text);
    } catch {
      return inferLanguageFromScript(text);
    }
  }

  async translateText(text, targetLanguage) {
    if (!text || !targetLanguage) {
      return text;
    }
    if (!this.client) {
      return text;
    }

    const normalizedTargetLanguage = normalizeLanguageCode(targetLanguage);
    const label = this.languageMap[normalizedTargetLanguage] || 'English';
    const translated = await this.complete({
      systemPrompt: `Translate the message into ${label}. Preserve meaning, names, dates and units. Output only the translation.`,
      userPrompt: text,
      temperature: 0,
      maxTokens: 260
    });
    return translated || text;
  }

  async generateAssistantReply({ message, conversationHistory = [], language = 'en' }) {
    const languageLabel = this.languageMap[language] || 'English';
    const history = conversationHistory
      .slice(-8)
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');
    const prompt = `${history ? `Conversation history:\n${history}\n\n` : ''}User message:\n${message}`;

    return this.complete({
      systemPrompt: `You are MediAssist, a smart hospital voice assistant at SRM Hospital. Reply entirely in ${languageLabel}. Do not switch languages unless the user speaks English.

You can help patients with:
- Booking, viewing, and cancelling appointments
- Viewing lab results, medications, and prescriptions
- Checking queue position and estimated wait times
- Entering and reviewing vitals (temperature, BP, heart rate, SpO2)
- Updating personal details (name, phone, email, address, blood group, allergies, emergency contact)
- Medical symptom analysis and guidance
- Navigating hospital pages (dashboard, profile, labs, queue, feedback, symptom checker)
- Setting medication reminders
- Finding consultation room numbers

Rules:
- Keep answers short, clear, and conversational (2-3 sentences max)
- For data changes, always confirm before executing
- For medical questions, provide general guidance and recommend consulting a doctor
- Be warm and empathetic`,
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 220
    });
  }

  async *streamAssistantReply({ message, conversationHistory = [], language = 'en' }) {
    const languageLabel = this.languageMap[language] || 'English';
    const history = conversationHistory
      .slice(-8)
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');
    const prompt = `${history ? `Conversation history:\n${history}\n\n` : ''}User message:\n${message}`;

    yield* this.streamComplete({
      systemPrompt: `You are MediAssist, a smart hospital voice assistant at SRM Hospital. Reply entirely in ${languageLabel}. Do not switch languages unless the user speaks English.

You can help patients with:
- Booking, viewing, and cancelling appointments
- Viewing lab results, medications, and prescriptions
- Checking queue position and estimated wait times
- Entering and reviewing vitals (temperature, BP, heart rate, SpO2)
- Updating personal details (name, phone, email, address, blood group, allergies, emergency contact)
- Medical symptom analysis and guidance
- Navigating hospital pages
- Setting medication reminders

Rules:
- Keep answers short, clear, and conversational (2-3 sentences max)
- For data changes, always confirm before executing
- For medical questions, provide general guidance and recommend consulting a doctor
- Be warm and empathetic`,
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 260
    });
  }

  async transcribeAudio(audioBuffer, filename = 'assistant-command.webm', options = {}) {
    if (!this.client) {
      this.logger?.('assistant_transcription_unavailable', { reason: 'missing_api_key' });
      return null;
    }

    const languageHint = typeof options === 'string'
      ? options
      : options?.languageHint || options?.language || options?.sessionLanguage || '';
    const normalizedLanguageHint = normalizeLanguageCode(languageHint, '');
    const isGpt4oTranscribe = /gpt-4o.*transcribe/i.test(this.transcriptionModel);

    const runTranscription = async (languageOverride = '') => {
      const { toFile } = require('openai');
      const file = await toFile(audioBuffer, filename, { type: inferAudioMimeType(filename) });
      const params = {
        model: this.transcriptionModel,
        file,
        temperature: 0,
        response_format: isGpt4oTranscribe ? 'json' : 'verbose_json',
        prompt: 'MediAssist medical assistant. Commands may be in English, Hindi, Telugu, Tamil, Kannada or Malayalam. Expect hospital terms such as appointment, consultation, lab results, queue and medication.'
      };

      if (languageOverride) {
        params.language = languageOverride;
      }

      return this.client.audio.transcriptions.create(params);
    };

    const buildResult = (response, detectionMode) => {
      const text = response?.text?.trim() || '';
      const detectedLanguage = normalizeLanguageCode(response?.language || inferLanguageFromScript(text));
      const confidenceScore = scoreLanguageConfidence({
        text,
        detectedLanguage,
        languageHint: normalizedLanguageHint
      });
      const translationMode = buildTranslationMode(detectedLanguage, confidenceScore, detectionMode);

      return {
        text,
        language: detectedLanguage,
        duration: response?.duration || null,
        confidenceScore,
        confidence_score: confidenceScore,
        translationMode,
        translation_mode: translationMode,
        detectionMode,
        detection_mode: detectionMode
      };
    };

    let result = buildResult(
      await runTranscription(normalizedLanguageHint),
      normalizedLanguageHint ? 'hinted' : 'automatic'
    );

    if (normalizedLanguageHint && result.confidenceScore < 0.6) {
      const automaticResult = buildResult(await runTranscription(''), 'automatic');
      if (automaticResult.confidenceScore >= result.confidenceScore) {
        result = automaticResult;
      }
    }

    this.logger?.('assistant_transcription_complete', {
      model: this.transcriptionModel,
      language: result.language,
      confidenceScore: result.confidenceScore,
      chars: result.text.length,
      detectionMode: result.detectionMode
    });

    return result;
  }

  async synthesizeSpeech(text, { voice = process.env.OPENAI_TTS_VOICE || 'alloy', format = 'mp3', speed = 1.0, language } = {}) {
    if (!this.client || !text) {
      this.logger?.('assistant_tts_unavailable', { reason: this.client ? 'missing_text' : 'missing_api_key' });
      return null;
    }

    const params = {
      model: this.ttsModel,
      voice,
      input: text.slice(0, 4000),
      response_format: format,
      speed
    };

    if (/gpt-4o.*tts/i.test(this.ttsModel)) {
      params.instructions = 'You are a warm, professional hospital receptionist. Speak naturally, calmly and clearly. Avoid robotic delivery. Match the language of the input.';
    }

    const response = await this.client.audio.speech.create(params);
    const arrayBuffer = await response.arrayBuffer();
    this.logger?.('assistant_tts_complete', {
      model: this.ttsModel,
      voice,
      language: language || 'auto',
      chars: text.length
    });
    return Buffer.from(arrayBuffer);
  }
}

module.exports = OpenAIAssistantGateway;
