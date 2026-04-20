const path = require('path');

require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'server', '.env')
});

const UnifiedAssistantService = require('../server/services/assistant/UnifiedAssistantService');

const LANGUAGE_SCRIPTS = Object.freeze({
  te: /[\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  en: /[A-Za-z]/
});

function showsLanguage(text, language) {
  const matcher = LANGUAGE_SCRIPTS[String(language || 'en').slice(0, 2).toLowerCase()] || LANGUAGE_SCRIPTS.en;
  return matcher.test(String(text || ''));
}

function preview(text, maxLength = 140) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

async function runProcessCase(service, testCase) {
  const startedAt = Date.now();
  const result = await service.processCommand({
    text: testCase.text,
    language: testCase.language,
    sessionLanguage: testCase.sessionLanguage,
    confidenceScore: testCase.confidenceScore,
    translationMode: testCase.translationMode,
    conversationHistory: []
  });
  const durationMs = Date.now() - startedAt;
  const responseLanguage = result.responseLanguage || result.response_language || result.language || 'en';
  const detectedLanguage = result.detectedLanguage || result.detected_language || responseLanguage;
  const responseText = result.response || '';
  const languageMatch = responseLanguage === testCase.expectedResponseLanguage;
  const scriptMatch = testCase.expectedResponseLanguage === 'en'
    ? true
    : showsLanguage(responseText, testCase.expectedResponseLanguage);

  return {
    scenario: testCase.name,
    type: 'process_command',
    detected_language: detectedLanguage,
    response_language: responseLanguage,
    confidence_score: result.confidenceScore ?? result.confidence_score ?? null,
    translation_mode: result.translationMode || result.translation_mode || null,
    latency_ms: durationMs,
    transcription_result: null,
    response_preview: preview(responseText),
    pass: Boolean(languageMatch && responseText && scriptMatch),
    expected_response_language: testCase.expectedResponseLanguage
  };
}

async function runStreamCase(service, testCase) {
  const startedAt = Date.now();
  let firstDeltaAt = null;
  let deltaCount = 0;
  let streamedText = '';
  const result = await service.streamCommand({
    text: testCase.text,
    language: testCase.language,
    sessionLanguage: testCase.sessionLanguage,
    confidenceScore: testCase.confidenceScore,
    translationMode: testCase.translationMode,
    conversationHistory: [],
    onEvent: (event) => {
      if (event.type === 'delta' && event.delta) {
        streamedText += event.delta;
        deltaCount += 1;
        if (!firstDeltaAt) {
          firstDeltaAt = Date.now();
        }
      }
    }
  });

  const durationMs = Date.now() - startedAt;
  const responseLanguage = result.responseLanguage || result.response_language || result.language || 'en';
  const detectedLanguage = result.detectedLanguage || result.detected_language || responseLanguage;
  const responseText = result.response || streamedText;
  const scriptMatch = testCase.expectedResponseLanguage === 'en'
    ? true
    : showsLanguage(responseText, testCase.expectedResponseLanguage);

  return {
    scenario: testCase.name,
    type: 'stream_command',
    detected_language: detectedLanguage,
    response_language: responseLanguage,
    confidence_score: result.confidenceScore ?? result.confidence_score ?? null,
    translation_mode: result.translationMode || result.translation_mode || null,
    latency_ms: durationMs,
    first_delta_ms: firstDeltaAt ? firstDeltaAt - startedAt : null,
    delta_count: deltaCount,
    transcription_result: null,
    response_preview: preview(responseText),
    pass: Boolean(responseLanguage === testCase.expectedResponseLanguage && responseText && scriptMatch && deltaCount > 0),
    expected_response_language: testCase.expectedResponseLanguage
  };
}

(async () => {
  const service = new UnifiedAssistantService();
  const cases = [
    {
      name: 'english_general_assistant',
      text: 'Please tell me what the OPD queue desk can help with.',
      language: 'en',
      sessionLanguage: 'en',
      confidenceScore: 0.98,
      expectedResponseLanguage: 'en'
    },
    {
      name: 'telugu_medical_guidance',
      text: 'నాకు రెండు రోజులుగా జ్వరం మరియు దగ్గు ఉన్నాయి. ఇప్పుడు ఏమి చేయాలి?',
      language: 'te',
      sessionLanguage: 'te',
      confidenceScore: 0.98,
      expectedResponseLanguage: 'te'
    },
    {
      name: 'tamil_appointment_help',
      text: 'என் அப்பாயிண்ட்மெண்ட் பற்றிய உதவி வேண்டும்.',
      language: 'ta',
      sessionLanguage: 'ta',
      confidenceScore: 0.97,
      expectedResponseLanguage: 'ta'
    },
    {
      name: 'low_confidence_language_switch',
      text: 'Explain my lab results in simple English.',
      language: 'te',
      sessionLanguage: 'te',
      confidenceScore: 0.32,
      expectedResponseLanguage: 'en'
    }
  ];

  const results = [];
  for (const testCase of cases) {
    results.push(await runProcessCase(service, testCase));
  }

  results.push(await runStreamCase(service, {
    name: 'streaming_telugu_response',
    text: 'దయచేసి ఒక చిన్న స్వాగత సందేశాన్ని తెలుగులో చెప్పండి.',
    language: 'te',
    sessionLanguage: 'te',
    confidenceScore: 0.99,
    expectedResponseLanguage: 'te'
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    status: results.every((entry) => entry.pass) ? 'ok' : 'degraded',
    scenarios: results
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'ok') {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', error: error.message }, null, 2));
  process.exitCode = 1;
});