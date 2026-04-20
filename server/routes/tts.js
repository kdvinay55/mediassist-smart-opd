const express = require('express');
const { auth } = require('../middleware/auth');
const OpenAIAssistantGateway = require('../services/assistant/OpenAIAssistantGateway');
const assistantRuntimeStatus = require('../services/assistant/AssistantRuntimeStatus');

const router = express.Router();
const gateway = new OpenAIAssistantGateway();

router.post('/', auth, async (req, res) => {
  try {
    if (!assistantRuntimeStatus.isLiveAssistantEnabled()) {
      const runtime = assistantRuntimeStatus.getStatus();
      res.set('X-AI-Status', runtime.demoMode ? 'demo' : 'disabled');
      return res.status(503).json({
        error: runtime.demoMode
          ? 'Live TTS is unavailable. Demo fallback should use browser speech synthesis.'
          : 'Assistant TTS is disabled until startup health verification passes.',
        demoMode: runtime.demoMode,
        assistantStatus: runtime
      });
    }

    const { text, voice, format, speed, language } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const audio = await gateway.synthesizeSpeech(text.trim(), {
      voice,
      format: format || 'mp3',
      speed: typeof speed === 'number' ? speed : 1.0,
      language
    });
    if (!audio) {
      return res.status(503).json({ error: 'TTS synthesis failed' });
    }

    res.set('X-AI-Status', 'active');
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(audio);
  } catch (error) {
    res.status(500).json({ error: error.message || 'TTS synthesis failed' });
  }
});

module.exports = router;
