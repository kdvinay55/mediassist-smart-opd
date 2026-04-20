const express = require('express');
const { auth } = require('../middleware/auth');
const UnifiedAssistantService = require('../services/assistant/UnifiedAssistantService');
const assistantRuntimeStatus = require('../services/assistant/AssistantRuntimeStatus');

const router = express.Router();
const assistantService = new UnifiedAssistantService();
const FALLBACK_EN = "I'm sorry, I didn't understand. Please try again.";

function buildUnavailablePayload(message) {
  const runtime = assistantRuntimeStatus.getStatus();
  return {
    type: 'unavailable',
    response: message,
    success: false,
    demoMode: runtime.demoMode,
    assistantStatus: runtime
  };
}

function resolveCommandInput(req) {
  return {
    text: String(req.body?.text || '').trim(),
    language: req.body?.language,
    sessionLanguage: req.body?.sessionLanguage,
    confidenceScore: Number.parseFloat(req.body?.confidenceScore),
    translationMode: req.body?.translationMode,
    conversationHistory: req.body?.conversationHistory || [],
    userId: req.user._id
  };
}

function writeStreamEvent(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

router.get('/health', auth, async (req, res) => {
  try {
    const live = ['1', 'true', 'yes'].includes(String(req.query.live || '').toLowerCase());
    if (live && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Live AI health checks require admin access.' });
    }

    const result = await assistantService.runHealthCheck({ live });
    const runtime = assistantRuntimeStatus.getStatus();
    const status = runtime.enabled && result.status === 'ok' ? 'active' : runtime.demoMode ? 'demo' : 'degraded';
    res.set('X-AI-Status', status);
    res.status(runtime.enabled || runtime.demoMode ? (result.status === 'ok' ? 200 : 503) : 503).json({
      ...result,
      runtime
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Assistant health check failed' });
  }
});

router.post('/command', auth, async (req, res) => {
  try {
    if (!assistantRuntimeStatus.isLiveAssistantEnabled()) {
      const payload = buildUnavailablePayload(
        assistantRuntimeStatus.isDemoMode()
          ? 'Live assistant is unavailable. Demo fallback should handle this request.'
          : 'Assistant startup health verification failed. Live assistant commands are disabled.'
      );
      res.set('X-AI-Status', assistantRuntimeStatus.isDemoMode() ? 'demo' : 'disabled');
      return res.status(503).json(payload);
    }

    const commandInput = resolveCommandInput(req);
    if (!commandInput.text) {
      return res.status(400).json({ error: 'No command text provided' });
    }
    const result = await assistantService.processCommand(commandInput);
    res.set('X-AI-Status', 'active');
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      type: 'error',
      response: FALLBACK_EN,
      success: false,
      error: error.message
    });
  }
});

router.post('/command/stream', auth, async (req, res) => {
  try {
    if (!assistantRuntimeStatus.isLiveAssistantEnabled()) {
      const payload = buildUnavailablePayload(
        assistantRuntimeStatus.isDemoMode()
          ? 'Live assistant is unavailable. Demo fallback should handle this request.'
          : 'Assistant startup health verification failed. Live assistant commands are disabled.'
      );
      res.set('X-AI-Status', assistantRuntimeStatus.isDemoMode() ? 'demo' : 'disabled');
      return res.status(503).json(payload);
    }

    const commandInput = resolveCommandInput(req);
    if (!commandInput.text) {
      return res.status(400).json({ error: 'No command text provided' });
    }

    res.set('X-AI-Status', 'active');
    res.set('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-transform');
    res.set('Connection', 'keep-alive');
    res.flushHeaders?.();

    const result = await assistantService.streamCommand({
      ...commandInput,
      onEvent: (event) => writeStreamEvent(res, event)
    });
    writeStreamEvent(res, { type: 'done', data: result });
    return res.end();
  } catch (error) {
    writeStreamEvent(res, {
      type: 'error',
      error: error.message || 'Assistant streaming failed'
    });
    return res.end();
  }
});

router.get('/suggestions', auth, (req, res) => {
  res.set('X-AI-Status', 'active');
  res.json({
    suggestions: [
      { text: 'Show my appointments', icon: 'calendar' },
      { text: 'What is my queue number?', icon: 'list' },
      { text: 'Show my lab results', icon: 'flask' },
      { text: 'Show my medications', icon: 'pill' },
      { text: 'Book appointment tomorrow', icon: 'plus' },
      { text: 'How long is the wait?', icon: 'clock' },
      { text: 'Where is my consultation room?', icon: 'map' },
      { text: 'Show my notifications', icon: 'bell' }
    ]
  });
});

module.exports = router;
