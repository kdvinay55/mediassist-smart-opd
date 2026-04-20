const express = require('express');
const Patient = require('../models/Patient');
const Consultation = require('../models/Consultation');
const Vitals = require('../models/Vitals');
const Medication = require('../models/Medication');
const { auth } = require('../middleware/auth');
const UnifiedAssistantService = require('../services/assistant/UnifiedAssistantService');

const router = express.Router();
const assistantService = new UnifiedAssistantService();

// GET /api/wellness/plan — Generate personalized wellness plan for logged-in patient
router.get('/plan', auth, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    const latestVitals = await Vitals.findOne({ patientId: req.user._id }).sort({ createdAt: -1 });
    const medications = await Medication.find({ patientId: req.user._id, isActive: true });
    const consultations = await Consultation.find({ patientId: req.user._id })
      .sort({ createdAt: -1 }).limit(5);

    const patientAge = patient?.dateOfBirth
      ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
      : 'Unknown';

    // Collect all diagnoses
    const diagnoses = [];
    for (const c of consultations) {
      if (c.finalDiagnosis?.length) diagnoses.push(...c.finalDiagnosis.map(d => d.condition || d));
      else if (c.aiSuggestedDiagnosis?.length) diagnoses.push(...c.aiSuggestedDiagnosis.map(d => d.condition));
    }

    const bmi = latestVitals?.bmi || (latestVitals?.weight && latestVitals?.height
      ? +(latestVitals.weight / ((latestVitals.height / 100) ** 2)).toFixed(1)
      : null);

    const patientData = {
      name: req.user.name,
      age: patientAge,
      gender: patient?.gender || 'Unknown',
      bmi,
      diagnoses: [...new Set(diagnoses)],
      chronicConditions: patient?.chronicConditions,
      allergies: patient?.allergies,
      medications: medications.map(m => ({ name: m.name, dosage: m.dosage })),
      vitals: latestVitals
    };

    const plan = await assistantService.generateWellnessPlan(patientData, req.query?.language || 'en');

    res.set('X-AI-Status', 'active');
    res.json({
      plan: plan || 'AI wellness plan temporarily unavailable. Please try again later.',
      patientSummary: {
        age: patientAge,
        gender: patient?.gender,
        bmi,
        diagnoses: [...new Set(diagnoses)],
        chronicConditions: patient?.chronicConditions || [],
        activeMedications: medications.length
      }
    });
  } catch (error) {
    console.error('Wellness plan error:', error);
    res.status(500).json({ error: 'Failed to generate wellness plan' });
  }
});

module.exports = router;
