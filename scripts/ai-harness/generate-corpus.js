// Expand seed prompts into a ~PER_LANG-sized corpus per language using
// gpt-4o-mini paraphrasing. Cached on disk so we only pay once.
//
// Usage: node generate-corpus.js [--per-lang 100]

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config({ path: path.join(__dirname, '../../server/.env') });

const { SEEDS_BY_LANG } = require('./seeds');

const PER_LANG = (() => {
  const idx = process.argv.indexOf('--per-lang');
  if (idx > -1) return parseInt(process.argv[idx + 1], 10) || 100;
  return 100;
})();

const CORPUS_PATH = path.join(__dirname, 'corpus.json');
const MODEL = 'gpt-4o-mini';

const LANG_NAME = {
  en: 'English', hi: 'Hindi', te: 'Telugu',
  ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam'
};

function buildParaphrasePrompt({ langName, original, count }) {
  return `You are creating realistic patient utterances for a hospital voice assistant.
Original (${langName}): ${original}

Produce exactly ${count} natural paraphrases in ${langName} that:
- Preserve the EXACT same meaning, intent, department, date, and time
- Sound like real spoken Indian patients (mixing colloquial and formal tone)
- Vary politeness, word order, fillers (please/can you/kindly/etc.)
- DO NOT change any time, date, department, or numeric value
- DO NOT add or remove any specific entity (e.g., if no time was given, do not add one)
- Each on its own line, no numbering, no quotes, no commentary.`;
}

async function paraphrase(client, langName, original, count) {
  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.9,
    messages: [
      { role: 'system', content: 'You output ONLY the requested paraphrases, one per line, with no headings, numbering or commentary.' },
      { role: 'user', content: buildParaphrasePrompt({ langName, original, count }) }
    ]
  });
  const text = resp.choices?.[0]?.message?.content || '';
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, count);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found in env. Set it or add to server/.env');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey });

  const existing = fs.existsSync(CORPUS_PATH)
    ? JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'))
    : { generatedAt: null, perLang: 0, byLang: {} };

  const corpus = { generatedAt: new Date().toISOString(), perLang: PER_LANG, byLang: {} };

  for (const [lang, seeds] of Object.entries(SEEDS_BY_LANG)) {
    const langName = LANG_NAME[lang];
    const perSeed = Math.max(1, Math.ceil((PER_LANG - seeds.length) / seeds.length));
    const items = [];
    let id = 0;

    // Always include the originals first
    for (const s of seeds) {
      items.push({ id: `${lang}-${id++}`, lang, prompt: s.prompt, expect: s.expect, intent: s.intent, source: 'seed' });
    }

    for (const s of seeds) {
      if (items.length >= PER_LANG) break;
      const need = Math.min(perSeed, PER_LANG - items.length);
      console.log(`[${lang}] paraphrasing seed (${s.intent}) -> ${need}`);
      try {
        const variants = await paraphrase(client, langName, s.prompt, need);
        for (const v of variants) {
          items.push({ id: `${lang}-${id++}`, lang, prompt: v, expect: s.expect, intent: s.intent, source: 'paraphrase' });
        }
      } catch (e) {
        console.warn(`  paraphrase failed: ${e.message}`);
      }
    }

    corpus.byLang[lang] = items.slice(0, PER_LANG);
    console.log(`[${lang}] total: ${corpus.byLang[lang].length}`);
  }

  fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  console.log(`\nWrote ${CORPUS_PATH}`);
  console.log(`Totals: ${Object.entries(corpus.byLang).map(([k, v]) => `${k}=${v.length}`).join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
