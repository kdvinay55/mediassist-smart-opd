const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const OpenAIAssistantGateway = require('../services/assistant/OpenAIAssistantGateway');
const assistantRuntimeStatus = require('../services/assistant/AssistantRuntimeStatus');

const router = express.Router();
const gateway = new OpenAIAssistantGateway();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/', auth, upload.single('audio'), async (req, res) => {
  try {
    if (!assistantRuntimeStatus.isLiveAssistantEnabled()) {
      const runtime = assistantRuntimeStatus.getStatus();
      res.set('X-AI-Status', runtime.demoMode ? 'demo' : 'disabled');
      return res.status(503).json({
        error: runtime.demoMode
          ? 'Live transcription is unavailable. Demo fallback should use browser speech recognition.'
          : 'Assistant transcription is disabled until startup health verification passes.',
        demoMode: runtime.demoMode,
        assistantStatus: runtime
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const result = await gateway.transcribeAudio(req.file.buffer, req.file.originalname || 'assistant-command.webm', {
      languageHint: req.body?.languageHint,
      confidenceScore: req.body?.confidenceScore,
      translationMode: req.body?.translationMode
    });
    if (!result || !result.text) {
      return res.status(503).json({ error: 'Transcription failed' });
    }

    res.set('X-AI-Status', 'active');
    res.json({
      text: result.text,
      language: result.language,
      duration: result.duration || null,
      confidenceScore: result.confidenceScore,
      confidence_score: result.confidence_score,
      translationMode: result.translationMode,
      translation_mode: result.translation_mode,
      detectionMode: result.detectionMode,
      detection_mode: result.detection_mode
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

module.exports = router;
