// Lightweight LLM judge — only called for medical/general-chat correctness.
// Returns { ok: boolean, reason: string }.

const OpenAI = require('openai');
const MODEL = 'gpt-4o-mini';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const SYSTEM = `You are an evaluator for a medical voice assistant. You receive (a) the user's question, (b) the assistant's reply, and (c) the topic the reply MUST cover. Decide if the reply is medically reasonable, on-topic, and (if a language is named) written in that language. Respond with strict JSON: {"ok": true|false, "reason": "short reason"}.`;

async function judgeMedical({ question, reply, topic, language }) {
  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Question: ${question}\n\nReply: ${reply}\n\nTopic the reply must cover: ${topic}${language ? `\nReply must be in: ${language}` : ''}` }
      ]
    });
    const raw = resp.choices?.[0]?.message?.content || '{"ok":false,"reason":"empty"}';
    const parsed = JSON.parse(raw);
    return { ok: !!parsed.ok, reason: parsed.reason || '' };
  } catch (e) {
    return { ok: false, reason: `judge_error: ${e.message}` };
  }
}

module.exports = { judgeMedical };
