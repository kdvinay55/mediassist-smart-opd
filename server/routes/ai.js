const express = require('express');
const { auth } = require('../middleware/auth');
const UnifiedAssistantService = require('../services/assistant/UnifiedAssistantService');

const router = express.Router();
const assistantService = new UnifiedAssistantService();

router.post('/chat', auth, async (req, res) => {
  try {
    const result = await assistantService.analyzeSymptoms({
      message: req.body?.message,
      symptoms: req.body?.symptoms || [],
      language: req.body?.language || 'en'
    });
    res.set('X-AI-Status', 'active');
    res.json(result);
  } catch (error) {
    res.status(500).json({ response: error.message || 'Symptom analysis failed' });
  }
});

router.post('/triage', auth, async (req, res) => {
  try {
    const result = await assistantService.triageVitals({
      vitals: req.body?.vitals || {},
      language: req.body?.language || 'en'
    });
    res.set('X-AI-Status', 'active');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Triage failed' });
  }
});

router.post('/treatment-plan', auth, async (req, res) => {
  try {
    const plan = await assistantService.generateTreatmentPlan({
      diagnosis: req.body?.diagnosis,
      vitals: req.body?.vitals,
      history: req.body?.history,
      language: req.body?.language || 'en'
    });
    res.set('X-AI-Status', 'active');
    res.json({ response: plan, plan });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Treatment plan generation failed' });
  }
});

module.exports = router;
