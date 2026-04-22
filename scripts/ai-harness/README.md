# AI Stress Harness

End-to-end correctness tester for the assistant. Posts real user utterances
in 6 languages to `/api/assistant/command`, scores the responses on intent,
entities (dept/time/date), reply script, and (for medical Q&A) factual
correctness via an LLM judge.

## What it covers

- 6 languages: `en, hi, te, ta, kn, ml`
- ~100 prompts per language (15 hand-authored seeds + LLM paraphrases)
- Intents: book/cancel/show/medical-qna/navigate/vitals
- Validation: HTTP status, intent code, action, department, timeSlot, date,
  reply script (Devanagari/Telugu/Tamil/Kannada/Malayalam), fallback detection,
  medical-Q&A judging via gpt-4o-mini.

## Setup

```powershell
cd smart-opd/scripts/ai-harness
npm install
```

`OPENAI_API_KEY` must be set (read automatically from `smart-opd/server/.env`).

## Generate corpus (one-time, cached to corpus.json)

```powershell
npm run gen           # 100 per language (~600 prompts, ~$1)
npm run gen:small     # 30 per language for faster iteration
```

## Run harness

```powershell
npm run run:smoke     # 10 per language, ~60 calls, fast sanity
npm run run           # full corpus against prod Render backend
npm run run:local     # against http://localhost:5000
```

Reports land in `reports/` and `reports/latest.md`.

## Custom run

```powershell
node run.js --base https://mediassist-api.onrender.com --langs en,te --limit 25 --concurrency 3
```
