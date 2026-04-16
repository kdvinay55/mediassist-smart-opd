const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { transcribeAudio } = require('../services/ai');

const router = express.Router();

// Multer: store audio in memory (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/m4a'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  }
});

// POST /api/transcribe — Transcribe audio using OpenAI Whisper
router.post('/', auth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const text = await transcribeAudio(req.file.buffer, req.file.originalname || 'audio.webm');

    if (!text) {
      return res.status(500).json({ error: 'Transcription failed' });
    }

    res.json({ text: text.trim() });
  } catch (error) {
    console.error('Transcription endpoint error:', error.message);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

module.exports = router;
