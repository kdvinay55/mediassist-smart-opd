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
  // gpt-5 spends most tokens on hidden reasoning before emitting output.
  // Triple the budget with a 1500-token floor so reasoning + reply both fit.
  return /^gpt-5/i.test(String(model || ''))
    ? { max_completion_tokens: Math.max(maxTokens * 3, 1500) }
    : { max_tokens: maxTokens };
}

function buildCompletionConfig(model, temperature, maxTokens, { reasoningEffort = 'low' } = {}) {
  return {
    ...buildTokenParams(model, maxTokens),
    ...(/^gpt-5/i.test(String(model || ''))
      ? { reasoning_effort: reasoningEffort }
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
    // Reuse a keep-alive HTTPS agent so OpenAI calls share TCP/TLS connections
    // (saves ~150-300ms per request after the first one).
    if (!OpenAIAssistantGateway._keepAliveAgent) {
      const https = require('https');
      OpenAIAssistantGateway._keepAliveAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50
      });
    }
    this.client = apiKey || process.env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: apiKey || process.env.OPENAI_API_KEY,
          httpAgent: OpenAIAssistantGateway._keepAliveAgent,
          timeout: 25000,
          maxRetries: 1
        })
      : null;
    this.assistantModel = ASSISTANT_MODELS.assistantLogic;
    this.transcriptionModel = ASSISTANT_MODELS.speechRecognition;
    this.ttsModel = ASSISTANT_MODELS.voiceOutput;
    this.medicalModel = ASSISTANT_MODELS.medicalReasoning;
    this.medicalReasoningEffort = ASSISTANT_MODELS.medicalReasoningEffort || 'low';
    this.languageMap = Object.fromEntries(SUPPORTED_LANGUAGES.map((entry) => [entry.code, entry.label]));
  }

  async complete({ model = this.assistantModel, systemPrompt, userPrompt, temperature = 0.2, maxTokens = 180, reasoningEffort } = {}) {
    if (!this.client) {
      return null;
    }

    const effort = reasoningEffort || (model === this.medicalModel ? this.medicalReasoningEffort : 'low');

    const response = await this.client.chat.completions.create({
      model,
      ...buildCompletionConfig(model, temperature, maxTokens, { reasoningEffort: effort }),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    return response?.choices?.[0]?.message?.content?.trim() || null;
  }

  async *streamComplete({ model = this.assistantModel, systemPrompt, userPrompt, temperature = 0.2, maxTokens = 180, reasoningEffort } = {}) {
    if (!this.client) {
      return;
    }

    const effort = reasoningEffort || (model === this.medicalModel ? this.medicalReasoningEffort : 'low');

    const stream = await this.client.chat.completions.create({
      model,
      ...buildCompletionConfig(model, temperature, maxTokens, { reasoningEffort: effort }),
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

    // Script-based detection wins immediately for non-Latin scripts (te, hi, ta, kn, ml).
    // This makes language switching instant and free — no AI call needed.
    const scriptLang = inferLanguageFromScript(text);
    if (scriptLang !== 'en') {
      return scriptLang;
    }

    // Pure Latin text: could be English OR Romanized regional (Tenglish/Hinglish).
    // Use session hint as soft preference; otherwise default to English.
    if (!this.client) return preferredLanguage ? normalizeLanguageCode(preferredLanguage) : 'en';

    try {
      const supported = Object.keys(this.languageMap).join(', ');
      const reply = await this.complete({
        systemPrompt: 'Detect the dominant language of the text. Reply with one two-letter ISO-639-1 code only. For Romanized regional text (e.g. "naaku appointment kavali" = te, "mujhe chahiye" = hi), pick the underlying language. For plain English, reply en.',
        userPrompt: `Supported codes: ${supported}.\nText:\n${text}`,
        temperature: 0,
        maxTokens: 6
      });
      const code = (reply || '').slice(0, 2).toLowerCase();
      return this.languageMap[code] ? code : 'en';
    } catch {
      return preferredLanguage ? normalizeLanguageCode(preferredLanguage) : 'en';
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
      systemPrompt: this.buildAssistantSystemPrompt(languageLabel),
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 200
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
      systemPrompt: this.buildAssistantSystemPrompt(languageLabel),
      userPrompt: prompt,
      temperature: 0.3,
      maxTokens: 240
    });
  }

  buildAssistantSystemPrompt(languageLabel) {
    return `You are MediAssist, a friendly AI assistant at SRM Hospital.

LANGUAGE RULES (very important):
- Default reply language: ${languageLabel}.
- MIRROR the user. If they mix English with Telugu/Hindi/Tamil/Kannada/Malayalam (Tenglish, Hinglish, Tanglish, etc.), reply in the SAME mixed style — do NOT switch to pure native script.
- If user writes Telugu in Roman letters ("naaku appointment kaavali"), reply in Roman Telugu, not Telugu script.
- If user writes pure Telugu script (తెలుగు), reply in pure Telugu script.
- Use Telugu words for Telugu requests, Hindi words for Hindi — never substitute Tamil words for Telugu or vice versa.

STYLE:
- Warm, natural, like a helpful human friend — never robotic.
- 1-2 short sentences usually. Max 3.
- Give practical info first; suggest a doctor only when truly needed.
- Skip greetings if the user already greeted; just answer.`;
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
        prompt: 'MediAssist Indian medical assistant. Audio may be in English, Hindi (हिन्दी देवनागरी), Telugu (తెలుగు), Tamil (தமிழ்), Kannada (ಕನ್ನಡ), or Malayalam (മലയാളം). These four South Indian languages use distinct scripts and must NOT be confused with each other. Transcribe in the script natively used by the language actually spoken. Hospital terms: appointment, consultation, lab, queue, medication, fever, cough, headache, diabetes, BP.'
      };

      if (languageOverride) {
        params.language = languageOverride;
      }

      return this.client.audio.transcriptions.create(params);
    };

    const buildResult = (response, detectionMode) => {
      const text = response?.text?.trim() || '';
      // Script detection is ground truth: if the transcribed text contains a
      // specific Indic script, the output language MUST match that script,
      // regardless of what Whisper labels response.language as. This prevents
      // mismatches where Whisper outputs Tamil characters but tags it 'te'.
      const scriptLanguage = inferLanguageFromScript(text);
      const detectedLanguage = scriptLanguage && scriptLanguage !== 'en'
        ? scriptLanguage
        : normalizeLanguageCode(response?.language || scriptLanguage);
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

    // Per-turn language independence: NEVER bias STT with the previous turn's
    // language. The session hint is kept only as a tiebreaker for confidence
    // scoring downstream — the audio model must freely detect what the user
    // actually spoke (Tamil vs Telugu vs Hindi vs Kannada vs Malayalam).
    const result = buildResult(await runTranscription(''), 'automatic');

    this.logger?.('assistant_transcription_complete', {
      model: this.transcriptionModel,
      language: result.language,
      confidenceScore: result.confidenceScore,
      chars: result.text.length,
      detectionMode: result.detectionMode
    });

    return result;
  }

  async synthesizeSpeech(text, { voice = process.env.OPENAI_TTS_VOICE || 'alloy', format = 'mp3', speed = 1.15, language } = {}) {
    if (!this.client || !text) {
      this.logger?.('assistant_tts_unavailable', { reason: this.client ? 'missing_text' : 'missing_api_key' });
      return null;
    }

    const detectedLanguage = normalizeLanguageCode(language || inferLanguageFromScript(text), 'en');
    const languageLabel = this.languageMap[detectedLanguage] || 'English';

    const params = {
      model: this.ttsModel,
      voice,
      input: text.slice(0, 4000),
      response_format: format,
      speed
    };

    if (/gpt-4o.*tts/i.test(this.ttsModel)) {
      const pronunciationGuards = {
        te: 'CRITICAL: Text is TELUGU only. Use ONLY authentic Telugu phonetics (soft "a" endings like "vaccharu", "cheppandi", "miru"). NEVER pronounce as Tamil, Kannada, Hindi, or Malayalam. Telugu has distinct vowels — do not borrow Tamil sounds.',
        hi: 'CRITICAL: Text is HINDI only. Use clean Hindustani pronunciation. Do NOT mix Telugu/Tamil/Kannada/Malayalam phonetics.',
        ta: 'CRITICAL: Text is TAMIL only. Use ONLY authentic Tamil phonetics (sounds like "vandhaar", "solunga", "neenga"). NEVER pronounce as Telugu (no soft "a" endings), Kannada, Hindi, or Malayalam. Tamil has unique retroflex consonants and characteristic Dravidian rhythm.',
        kn: 'CRITICAL: Text is KANNADA only. Use ONLY authentic Kannada phonetics. NEVER pronounce as Telugu, Tamil, Hindi, or Malayalam.',
        ml: 'CRITICAL: Text is MALAYALAM only. Use ONLY authentic Malayalam phonetics with characteristic clusters. NEVER pronounce as Tamil, Telugu, Kannada, or Hindi.',
        en: 'Text is English (Indian English accent acceptable). Use clear, neutral pronunciation.'
      };
      const guard = pronunciationGuards[detectedLanguage] || pronunciationGuards.en;
      params.instructions = `You are MediAssist, a warm friendly hospital assistant speaking ${languageLabel}. ${guard} Speak naturally and conversationally like a helpful human — not robotic or monotone. Flow smoothly between sentences with minimal pauses. If the text mixes English and ${languageLabel}, switch fluently while keeping each word in its native pronunciation.`;
    }

    const response = await this.client.audio.speech.create(params);
    const arrayBuffer = await response.arrayBuffer();
    this.logger?.('assistant_tts_complete', {
      model: this.ttsModel,
      voice,
      language: detectedLanguage,
      chars: text.length
    });
    return Buffer.from(arrayBuffer);
  }
}

module.exports = OpenAIAssistantGateway;
