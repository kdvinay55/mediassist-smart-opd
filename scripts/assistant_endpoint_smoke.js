const path = require('path');
const { Blob } = require('buffer');

require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'server', '.env')
});

const baseUrl = String(
  process.env.ASSISTANT_SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`
).replace(/\/$/, '');
const token = process.env.ASSISTANT_SMOKE_TOKEN || '';
const commandText = process.env.ASSISTANT_SMOKE_COMMAND || 'Show my appointments';
const ttsText = process.env.ASSISTANT_SMOKE_TTS_TEXT || 'MediAssist smoke test.';

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const body = await parseResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

(async () => {
  if (!token) {
    throw new Error('ASSISTANT_SMOKE_TOKEN is required to run authenticated endpoint smoke tests.');
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const health = await requestJson('/assistant/health', {
    headers: authHeaders
  });

  const command = await requestJson('/assistant/command', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: commandText,
      language: 'en',
      conversationHistory: []
    })
  });

  const ttsResponse = await fetch(`${baseUrl}/tts`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: ttsText,
      language: 'en'
    })
  });

  const ttsBuffer = ttsResponse.ok
    ? Buffer.from(await ttsResponse.arrayBuffer())
    : null;

  let transcribe = { ok: false, status: 0, body: { skipped: true } };

  if (ttsBuffer) {
    const formData = new FormData();
    formData.append('audio', new Blob([ttsBuffer], { type: 'audio/mpeg' }), 'assistant-smoke.mp3');

    const transcribeResponse = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });

    transcribe = {
      ok: transcribeResponse.ok,
      status: transcribeResponse.status,
      body: await parseResponse(transcribeResponse)
    };
  }

  const result = {
    status: health.ok && command.ok && ttsResponse.ok && transcribe.ok ? 'ok' : 'failed',
    baseUrl,
    endpoints: {
      health,
      command,
      tts: {
        ok: ttsResponse.ok,
        status: ttsResponse.status,
        bytes: ttsBuffer?.length || 0
      },
      transcribe
    }
  };

  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', error: error.message, baseUrl }, null, 2));
  process.exitCode = 1;
});