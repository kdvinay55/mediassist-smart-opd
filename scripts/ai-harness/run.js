// AI Stress Harness — runs the corpus against the assistant and produces a
// structured failure report grouped by (lang, intent, failure mode).
//
// Usage:
//   node run.js                 # default: prod backend, all langs
//   node run.js --base http://localhost:5000
//   node run.js --langs en,te
//   node run.js --concurrency 3
//   node run.js --limit 20      # cap per language for fast smoke

const fs = require('fs');
const path = require('path');
const Appointment = null; // not used directly — assertions read response payload
require('dotenv').config({ path: path.join(__dirname, '../../server/.env') });

const { SCRIPT_FAMILY } = require('./seeds');
const { judgeMedical } = require('./judge');

const CORPUS_PATH = path.join(__dirname, 'corpus.json');
const REPORT_DIR = path.join(__dirname, 'reports');
fs.mkdirSync(REPORT_DIR, { recursive: true });

// ---------- args ----------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}
const BASE = arg('base', 'https://mediassist-api.onrender.com');
const CONCURRENCY = parseInt(arg('concurrency', '4'), 10);
const LIMIT = parseInt(arg('limit', '0'), 10); // 0 = no cap
const LANGS = arg('langs', 'en,hi,te,ta,kn,ml').split(',').map(s => s.trim()).filter(Boolean);
const PATIENT_USER = process.env.HARNESS_PATIENT || 'rahul@patient.com';
const PATIENT_PASS = process.env.HARNESS_PASS || 'patient123';

// ---------- script detection ----------
const SCRIPT_RANGES = {
  latin: /[A-Za-z]/,
  devanagari: /[\u0900-\u097F]/,
  telugu: /[\u0C00-\u0C7F]/,
  tamil: /[\u0B80-\u0BFF]/,
  kannada: /[\u0C80-\u0CFF]/,
  malayalam: /[\u0D00-\u0D7F]/
};
function detectScript(text) {
  const counts = {};
  for (const [name, rx] of Object.entries(SCRIPT_RANGES)) {
    counts[name] = (text.match(new RegExp(rx, 'g')) || []).length;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : 'none';
}

// ---------- fetch ----------
let CURRENT_TOKEN = null;
async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: PATIENT_USER, password: PATIENT_PASS })
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  const body = await r.json();
  CURRENT_TOKEN = body.token;
  return body.token;
}

async function callAssistant(_unusedToken, text, language, attempt = 0) {
  try {
    const r = await fetch(`${BASE}/api/assistant/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CURRENT_TOKEN}` },
      body: JSON.stringify({ text, language, sessionLanguage: language, conversationHistory: [] })
    });
    let body = null;
    try { body = await r.json(); } catch { body = { _parseError: true }; }
    // Re-login on 401 and retry once
    if (r.status === 401 && attempt < 2) {
      await login();
      return callAssistant(null, text, language, attempt + 1);
    }
    // Retry once on 5xx (transient OpenAI/network/DB hiccup under concurrency)
    if (r.status >= 500 && attempt < 2) {
      await new Promise((res) => setTimeout(res, 500 + attempt * 750));
      return callAssistant(null, text, language, attempt + 1);
    }
    return { status: r.status, body };
  } catch (e) {
    if (attempt < 2) {
      await new Promise((res) => setTimeout(res, 500 + attempt * 750));
      return callAssistant(null, text, language, attempt + 1);
    }
    return { status: 0, body: { _networkError: e.message } };
  }
}

// ---------- validation ----------
const FALLBACK_RX = /(didn'?t understand|didn'?t catch|sorry.*understand|క్షమించండి.*అర్థం|क्षमा.*समझ|மன்னிக்கவும்.*புரிய|ಕ್ಷಮಿಸಿ.*ಅರ್ಥ|ക്ഷമിക്കണം.*മനസ്സിലായില്ല)/i;

async function validate(item, result) {
  const failures = [];
  const { expect, lang, prompt, intent: expectedIntent } = item;
  const { status, body } = result;

  if (status >= 500) {
    failures.push({ kind: 'http_error', detail: `status ${status}` });
    return failures;
  }
  if (status === 503) {
    failures.push({ kind: 'service_unavailable', detail: body?.response || 'assistant disabled' });
    return failures;
  }

  const responseText = String(body?.response || body?.text || '');
  const intent = body?.intent || body?.data?.intent || null;
  const action = body?.action || null;
  const data = body?.data || null;

  if (expect.notFallback && FALLBACK_RX.test(responseText)) {
    failures.push({ kind: 'fallback_reply', detail: responseText.slice(0, 120) });
  }

  if (expect.intent) {
    const expected = Array.isArray(expect.intent) ? expect.intent : [expect.intent];
    // Some endpoints don't echo intent; infer from action/navigateTo
    const inferred = intent || (body?.navigateTo === '/appointments' && expected.includes('BOOK_APPOINTMENT') ? 'BOOK_APPOINTMENT' : null);
    if (intent && !expected.includes(intent)) {
      failures.push({ kind: 'wrong_intent', detail: `got ${intent}, expected ${expected.join('|')}` });
    } else if (!intent && !inferred && expected.includes('BOOK_APPOINTMENT') && !data?.timeSlot) {
      // No intent echoed AND no booking data — suspicious
      if (!data && !body?.navigateTo) failures.push({ kind: 'missing_intent', detail: 'no intent/data/navigateTo in response' });
    }
  }

  if (expect.actionType && action !== expect.actionType) {
    // Tolerant: missing action only fails for booking
    if (expect.actionType === 'NAVIGATE' && expectedIntent === 'BOOK_APPOINTMENT' && body?.success === false) {
      failures.push({ kind: 'booking_failed', detail: responseText.slice(0, 120) });
    } else if (expect.actionType === 'NAVIGATE' && !body?.navigateTo) {
      failures.push({ kind: 'missing_action', detail: `expected action ${expect.actionType}` });
    }
  }

  if (expect.deptMatch && data?.department) {
    const rx = expect.deptMatch instanceof RegExp ? expect.deptMatch : new RegExp(expect.deptMatch, 'i');
    if (!rx.test(data.department)) failures.push({ kind: 'wrong_department', detail: `got "${data.department}"` });
  }

  if (expect.timeSlotMatch && data?.timeSlot) {
    const rx = expect.timeSlotMatch instanceof RegExp ? expect.timeSlotMatch : new RegExp(expect.timeSlotMatch);
    if (!rx.test(data.timeSlot)) failures.push({ kind: 'wrong_time_slot', detail: `got "${data.timeSlot}"` });
  } else if (expect.timeSlotMatch && expectedIntent === 'BOOK_APPOINTMENT' && !data?.timeSlot && body?.success !== false) {
    failures.push({ kind: 'missing_time_slot', detail: 'booking succeeded but no timeSlot in data' });
  }

  if (typeof expect.dateOffset === 'number' && data?.date) {
    const got = new Date(data.date);
    const todayIst = new Date(Date.now() + 5.5 * 60 * 60000);
    const expectedIst = new Date(todayIst.getTime() + expect.dateOffset * 86400000);
    const sameDay = (a, b) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
    if (!sameDay(new Date(got.getTime() + 5.5 * 60 * 60000), expectedIst)) {
      failures.push({ kind: 'wrong_date', detail: `got ${got.toISOString().slice(0,10)}, expected offset +${expect.dateOffset}` });
    }
  }

  if (lang !== 'en' && responseText) {
    const expectedScript = SCRIPT_FAMILY[lang];
    const got = detectScript(responseText);
    if (expectedScript && got !== expectedScript && got !== 'latin') {
      // 'latin' is acceptable fallback (English)
      // but having ONLY latin for a non-en prompt is weak; flag
      failures.push({ kind: 'wrong_script', detail: `got ${got}, expected ${expectedScript}` });
    } else if (expectedScript && got === 'latin') {
      failures.push({ kind: 'english_reply_for_indic_prompt', detail: responseText.slice(0, 80) });
    }
  }

  if (expect.judgeFor && responseText) {
    const judged = await judgeMedical({
      question: prompt, reply: responseText,
      topic: expect.judgeFor.topic, language: expect.judgeFor.language
    });
    if (!judged.ok) failures.push({ kind: 'medical_judge_fail', detail: judged.reason });
  }

  return failures;
}

// ---------- runner ----------
async function runOne(token, item) {
  const t0 = Date.now();
  let result;
  try {
    result = await callAssistant(token, item.prompt, item.lang);
  } catch (e) {
    result = { status: 0, body: { _networkError: e.message } };
  }
  const ms = Date.now() - t0;
  const failures = await validate(item, result);
  return { id: item.id, lang: item.lang, expectedIntent: item.intent, prompt: item.prompt,
    status: result.status, response: result.body?.response, data: result.body?.data,
    serverError: result.body?.error || null,
    actualIntent: result.body?.intent || null,
    success: result.body?.success, action: result.body?.action, type: result.body?.type,
    ms, failures };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, active = 0, done = 0;
  return new Promise((resolve) => {
    const tick = () => {
      while (active < n && i < items.length) {
        const idx = i++;
        active++;
        fn(items[idx]).then(r => { out[idx] = r; }).catch(e => { out[idx] = { error: e.message, item: items[idx] }; })
          .finally(() => {
            active--; done++;
            if (done % 10 === 0 || done === items.length) {
              process.stdout.write(`\r  progress: ${done}/${items.length}`);
            }
            if (done === items.length) { process.stdout.write('\n'); resolve(out); }
            else tick();
          });
      }
    };
    tick();
  });
}

async function main() {
  if (!fs.existsSync(CORPUS_PATH)) {
    console.error(`Corpus not found at ${CORPUS_PATH}. Run generate-corpus.js first.`);
    process.exit(1);
  }
  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));

  console.log(`Backend: ${BASE}`);
  console.log(`Languages: ${LANGS.join(', ')}`);
  console.log(`Concurrency: ${CONCURRENCY}, per-lang limit: ${LIMIT || 'none'}`);

  console.log('\nLogging in...');
  const token = await login();
  console.log('OK');

  const allResults = [];
  for (const lang of LANGS) {
    let items = corpus.byLang[lang] || [];
    if (LIMIT > 0) items = items.slice(0, LIMIT);
    if (items.length === 0) { console.log(`[${lang}] empty corpus, skipping`); continue; }
    console.log(`\n[${lang}] running ${items.length} prompts...`);
    const results = await pool(items, CONCURRENCY, (it) => runOne(token, it));
    allResults.push(...results);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(REPORT_DIR, `report-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, generatedAt: stamp, results: allResults }, null, 2));

  // Markdown summary
  const byLang = {};
  for (const r of allResults) {
    const l = r.lang || 'unknown';
    byLang[l] = byLang[l] || { total: 0, pass: 0, failures: {}, samples: [] };
    byLang[l].total++;
    if (!r.failures || r.failures.length === 0) byLang[l].pass++;
    else {
      for (const f of r.failures) {
        byLang[l].failures[f.kind] = (byLang[l].failures[f.kind] || 0) + 1;
      }
      if (byLang[l].samples.length < 5) byLang[l].samples.push({ id: r.id, prompt: r.prompt, response: r.response, failures: r.failures });
    }
  }

  let md = `# AI Harness Report\n\n- Backend: ${BASE}\n- Generated: ${stamp}\n- Total prompts: ${allResults.length}\n\n`;
  md += `## Per-language Pass Rate\n\n| Lang | Total | Pass | Fail | Pass % |\n|---|---|---|---|---|\n`;
  for (const [lang, s] of Object.entries(byLang)) {
    const pct = s.total ? ((s.pass / s.total) * 100).toFixed(1) : '0.0';
    md += `| ${lang} | ${s.total} | ${s.pass} | ${s.total - s.pass} | ${pct}% |\n`;
  }
  md += `\n## Failure Modes by Language\n\n`;
  for (const [lang, s] of Object.entries(byLang)) {
    md += `### ${lang}\n\n`;
    const sorted = Object.entries(s.failures).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) { md += `_no failures_\n\n`; continue; }
    md += `| Failure | Count |\n|---|---|\n`;
    for (const [k, v] of sorted) md += `| ${k} | ${v} |\n`;
    md += `\n**Sample failures:**\n\n`;
    for (const sm of s.samples) {
      md += `- **${sm.id}** \`${sm.prompt}\`\n`;
      md += `  - response: \`${(sm.response || '').slice(0, 200)}\`\n`;
      md += `  - failures: ${sm.failures.map(f => `${f.kind} (${f.detail})`).join('; ')}\n`;
    }
    md += `\n`;
  }

  const mdPath = path.join(REPORT_DIR, `report-${stamp}.md`);
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(path.join(REPORT_DIR, 'latest.md'), md);
  fs.writeFileSync(path.join(REPORT_DIR, 'latest.json'), JSON.stringify({ base: BASE, generatedAt: stamp, results: allResults }, null, 2));

  console.log(`\nReport: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);
  console.log(`\n=== SUMMARY ===`);
  for (const [lang, s] of Object.entries(byLang)) {
    const pct = s.total ? ((s.pass / s.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${lang}: ${s.pass}/${s.total} pass (${pct}%)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
