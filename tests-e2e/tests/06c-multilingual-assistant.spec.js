// Phase 8c — Multilingual AI assistant: API-driven validation across en/te/ta/hi.
// Mirrors smart-opd/scripts/assistant_multilingual_validation.js but assertion-driven.
import { test, expect } from '@playwright/test';
import { apiContext } from '../fixtures/api.js';

const LANGUAGE_SCRIPTS = {
  te: /[\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  en: /[A-Za-z]/
};

function showsScript(text, lang) {
  return (LANGUAGE_SCRIPTS[lang] || LANGUAGE_SCRIPTS.en).test(String(text || ''));
}

const SCENARIOS = [
  {
    name: 'english_general',
    text: 'Please tell me what the OPD queue desk can help with.',
    language: 'en',
    expected: 'en'
  },
  {
    name: 'telugu_medical_guidance',
    text: 'నాకు రెండు రోజులుగా జ్వరం మరియు దగ్గు ఉన్నాయి. ఇప్పుడు ఏమి చేయాలి?',
    language: 'te',
    expected: 'te'
  },
  {
    name: 'tamil_appointment_help',
    text: 'என் அப்பாயிண்ட்மெண்ட் பற்றிய உதவி வேண்டும்.',
    language: 'ta',
    expected: 'ta'
  },
  {
    name: 'hindi_appointment_help',
    text: 'मेरी अपॉइंटमेंट के बारे में मदद चाहिए।',
    language: 'hi',
    expected: 'hi'
  }
];

test.describe('Phase 8c — Multilingual assistant', () => {

  test.beforeAll(async () => {
    const ctx = await apiContext('patient');
    const h = await ctx.get('/api/assistant/health');
    const ok = h.ok();
    await ctx.dispose();
    test.skip(!ok, `Assistant degraded (${h.status()}) — multilingual tests require a working LLM provider`);
  });

  for (const scn of SCENARIOS) {
    test(`assistant responds in ${scn.expected} for "${scn.name}"`, async () => {
      test.setTimeout(120_000);
      const ctx = await apiContext('patient');
      const r = await ctx.post('/api/assistant/command', {
        timeout: 90_000,
        data: {
          text: scn.text,
          language: scn.language,
          sessionLanguage: scn.language,
          confidenceScore: 0.98
        }
      });
      expect(r.ok(), `command status ${r.status()}`).toBeTruthy();
      const body = await r.json();
      const reply = body.response || body.text || body.message || '';
      const lang = body.responseLanguage || body.response_language || body.language || 'en';
      expect(reply, 'reply text must be non-empty').toBeTruthy();
      // Language-tag check OR script check — at least one must match (engines vary in metadata)
      const langOk = lang === scn.expected;
      const scriptOk = showsScript(reply, scn.expected);
      expect(langOk || scriptOk, `expected ${scn.expected}; got lang=${lang} reply="${String(reply).slice(0,80)}"`).toBeTruthy();
      await ctx.dispose();
    });
  }
});
