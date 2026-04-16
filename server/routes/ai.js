const express = require('express');
const { auth } = require('../middleware/auth');
const { chatWithAI, generateTriageAssessment, generateTreatmentPlan } = require('../services/ai');

const router = express.Router();

// POST /api/ai/chat
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, context } = req.body;
    const response = await chatWithAI(message, context || '');
    res.json({ response });
  } catch (error) {
    res.json({ response: 'AI service is currently unavailable. Please try again later.' });
  }
});

// POST /api/ai/triage
router.post('/triage', auth, async (req, res) => {
  try {
    const assessment = await generateTriageAssessment(req.body);
    res.json({ assessment });
  } catch (error) {
    res.status(500).json({ error: 'AI triage failed' });
  }
});

// POST /api/ai/treatment-plan
router.post('/treatment-plan', auth, async (req, res) => {
  try {
    const { diagnosis, patientInfo } = req.body;
    const plan = await generateTreatmentPlan(diagnosis, patientInfo);
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'AI treatment plan failed' });
  }
});

module.exports = router;
