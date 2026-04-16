const express = require('express');
const Consultation = require('../models/Consultation');
const Appointment = require('../models/Appointment');
const Medication = require('../models/Medication');
const Vitals = require('../models/Vitals');
const LabResult = require('../models/LabResult');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { generateDiagnosis, chatWithAI, generatePatientHistorySummary, generateReferralLetter } = require('../services/ai');
const { createNotification, scheduleFollowUp } = require('../services/simulationEngine');

const router = express.Router();

// POST /api/consultations
router.post('/', auth, authorize('doctor'), async (req, res) => {
  try {
    const { appointmentId, chiefComplaint, symptoms, symptomDuration, examination } = req.body;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Return existing consultation if one already exists for this appointment
    const existing = await Consultation.findOne({ appointmentId });
    if (existing) {
      return res.json(existing);
    }

    appointment.status = 'in-consultation';
    await appointment.save();

    // For follow-up appointments, pre-populate with previous consultation data
    let followUpData = {};
    if (appointment.type === 'follow-up' && appointment.previousConsultationId) {
      const prevConsultation = await Consultation.findById(appointment.previousConsultationId);
      if (prevConsultation) {
        followUpData = {
          chiefComplaint: chiefComplaint || `Follow-up: ${prevConsultation.chiefComplaint || 'Lab results review'}`,
          symptoms: symptoms?.length ? symptoms : (prevConsultation.symptoms || ['Lab results follow-up']),
        };
      }
    }

    const consultation = await Consultation.create({
      appointmentId,
      patientId: appointment.patientId,
      doctorId: req.user._id,
      chiefComplaint: followUpData.chiefComplaint || chiefComplaint,
      symptoms: followUpData.symptoms || symptoms,
      symptomDuration,
      examination
    });

    res.status(201).json(consultation);
  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({ error: 'Failed to create consultation' });
  }
});

// PUT /api/consultations/:id
router.put('/:id', auth, authorize('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }
    res.json(consultation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update consultation' });
  }
});

// POST /api/consultations/:id/ai-diagnosis
router.post('/:id/ai-diagnosis', auth, authorize('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const result = await generateDiagnosis(
      consultation.symptoms || [],
      req.body.vitals,
      req.body.history
    );

    // Try to parse structured response
    let aiDiagnosis = [];
    try {
      const parsed = JSON.parse(result);
      if (parsed.diagnoses) aiDiagnosis = parsed.diagnoses;
    } catch {
      aiDiagnosis = [{ condition: result, confidence: 0 }];
    }

    consultation.aiSuggestedDiagnosis = aiDiagnosis;
    await consultation.save();

    res.json({ aiDiagnosis, rawResponse: result });
  } catch (error) {
    console.error('AI diagnosis error:', error);
    res.status(500).json({ error: 'AI diagnosis failed' });
  }
});

// POST /api/consultations/:id/chat
router.post('/:id/chat', auth, authorize('doctor'), async (req, res) => {
  try {
    const { message } = req.body;
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    // Build context from consultation
    const context = `Patient symptoms: ${consultation.symptoms?.join(', ')}. Chief complaint: ${consultation.chiefComplaint || 'N/A'}.`;

    const aiResponse = await chatWithAI(message, context);

    // Save to chat history
    consultation.aiChatHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: aiResponse }
    );
    await consultation.save();

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: 'AI chat failed' });
  }
});

// POST /api/consultations/:id/complete
router.post('/:id/complete', auth, authorize('doctor'), async (req, res) => {
  try {
    const { finalDiagnosis, treatmentPlan, prescriptions, followUpDate, followUpInstructions } = req.body;

    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    consultation.finalDiagnosis = finalDiagnosis;
    consultation.treatmentPlan = treatmentPlan;
    consultation.prescriptions = prescriptions;
    consultation.followUpDate = followUpDate;
    consultation.followUpInstructions = followUpInstructions;
    consultation.status = 'completed';
    await consultation.save();

    // Create medications from prescriptions
    if (prescriptions && prescriptions.length > 0) {
      const meds = prescriptions.map(p => {
        // Calculate endDate from duration (e.g., "5 days", "2 weeks")
        let endDate = new Date();
        const durationStr = (p.duration || '7 days').toLowerCase();
        const num = parseInt(durationStr) || 7;
        if (durationStr.includes('week')) endDate.setDate(endDate.getDate() + num * 7);
        else if (durationStr.includes('month')) endDate.setMonth(endDate.getMonth() + num);
        else endDate.setDate(endDate.getDate() + num);

        return {
          patientId: consultation.patientId,
          consultationId: consultation._id,
          prescribedBy: req.user._id,
          name: p.medication,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          instructions: p.instructions,
          startDate: new Date(),
          endDate,
          isActive: true
        };
      });
      await Medication.insertMany(meds);
    }

    // Update appointment
    await Appointment.findByIdAndUpdate(consultation.appointmentId, { status: 'completed', completedAt: new Date() });

    // Notify patient about consultation completion
    const diagnosisText = (finalDiagnosis || []).map(d => d.condition || d).filter(Boolean).join(', ');
    await createNotification(consultation.patientId, 'system',
      'Consultation Completed',
      `Your consultation with Dr. ${req.user.name} is complete.${diagnosisText ? ' Diagnosis: ' + diagnosisText + '.' : ''} Check your prescriptions and medications.`,
      consultation._id, 'Consultation');

    // Schedule follow-up if date provided
    if (followUpDate) {
      try { await scheduleFollowUp(consultation._id); } catch (e) { console.error('Follow-up scheduling error:', e.message); }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`patient-${consultation.patientId}`).emit('consultation-complete', { consultationId: consultation._id });
    }

    res.json(consultation);
  } catch (error) {
    console.error('Complete consultation error:', error);
    res.status(500).json({ error: 'Failed to complete consultation' });
  }
});

// GET /api/consultations/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate('patientId', 'name email')
      .populate('doctorId', 'name specialization')
      .populate('appointmentId');
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }
    res.json(consultation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get consultation' });
  }
});

// POST /api/consultations/:id/referral — Generate referral to specialist
router.post('/:id/referral', auth, authorize('doctor'), async (req, res) => {
  try {
    const { department, doctor, reason, urgency } = req.body;
    const consultation = await Consultation.findById(req.params.id)
      .populate('patientId', 'name')
      .populate('doctorId', 'name specialization department')
      .populate('appointmentId');

    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    const patient = await Patient.findOne({ userId: consultation.patientId._id });
    const patientAge = patient?.dateOfBirth
      ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
      : 'Unknown';

    // Generate AI referral letter
    const referralLetter = await generateReferralLetter({
      referringDoctor: consultation.doctorId?.name || req.user.name,
      fromDepartment: consultation.doctorId?.department || consultation.appointmentId?.department || 'General',
      patientName: consultation.patientId?.name || 'Patient',
      patientAge,
      toDepartment: department,
      toDoctor: doctor || '',
      urgency: urgency || 'routine',
      reason,
      diagnosis: consultation.finalDiagnosis?.map(d => d.condition || d).join(', ') || consultation.chiefComplaint || '',
      history: consultation.notes || '',
      medications: consultation.prescriptions?.map(p => `${p.medication} ${p.dosage}`).join(', ') || 'None'
    });

    // Save referral to consultation
    const referral = { department, doctor: doctor || '', reason, urgency: urgency || 'routine', referralLetter, createdAt: new Date() };
    consultation.referrals = consultation.referrals || [];
    consultation.referrals.push(referral);
    await consultation.save();

    res.json({ referral, referralLetter, message: `Referral to ${department} generated successfully` });
  } catch (error) {
    console.error('Referral error:', error);
    res.status(500).json({ error: 'Failed to generate referral' });
  }
});

// GET /api/consultations/:id/patient-history — AI summarized patient history
router.get('/:id/patient-history', auth, authorize('doctor'), async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id).populate('patientId', 'name');
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    const patientUserId = typeof consultation.patientId === 'string' ? consultation.patientId : consultation.patientId._id;

    // Gather all patient data
    const patient = await Patient.findOne({ userId: patientUserId });
    const pastConsultations = await Consultation.find({ patientId: patientUserId, _id: { $ne: consultation._id } })
      .sort({ createdAt: -1 }).limit(10);
    const latestVitals = await Vitals.findOne({ patientId: patientUserId }).sort({ createdAt: -1 });
    const medications = await Medication.find({ patientId: patientUserId, isActive: true });
    const labResults = await LabResult.find({ patientId: patientUserId }).sort({ createdAt: -1 }).limit(5);

    const patientAge = patient?.dateOfBirth
      ? new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()
      : 'Unknown';

    const patientData = {
      name: consultation.patientId?.name || 'Patient',
      age: patientAge,
      gender: patient?.gender || 'Unknown',
      bloodGroup: patient?.bloodGroup,
      allergies: patient?.allergies,
      chronicConditions: patient?.chronicConditions,
      consultations: pastConsultations.map(c => ({
        date: c.createdAt?.toLocaleDateString() || 'N/A',
        chiefComplaint: c.chiefComplaint,
        finalDiagnosis: c.finalDiagnosis,
        aiSuggestedDiagnosis: c.aiSuggestedDiagnosis,
        treatmentPlan: c.treatmentPlan,
        prescriptions: c.prescriptions
      })),
      vitals: latestVitals,
      medications: medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
      labResults: labResults.map(l => ({ testName: l.testName, status: l.status, results: l.results, createdAt: l.createdAt, priority: l.priority }))
    };

    const summary = await generatePatientHistorySummary(patientData);

    res.json({
      summary: summary || 'AI summary temporarily unavailable. See raw data below.',
      patientData: {
        age: patientAge,
        gender: patient?.gender,
        bloodGroup: patient?.bloodGroup,
        allergies: patient?.allergies,
        chronicConditions: patient?.chronicConditions,
        pastConsultationsCount: pastConsultations.length,
        pastConsultations: pastConsultations.map(c => ({
          date: c.createdAt?.toLocaleDateString() || 'N/A',
          chiefComplaint: c.chiefComplaint,
          finalDiagnosis: c.finalDiagnosis,
          treatmentPlan: c.treatmentPlan,
          prescriptions: c.prescriptions
        })),
        activeMedications: medications.length,
        medications: medications.map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
        recentLabResults: labResults.length,
        labResults: labResults.map(l => ({ testName: l.testName, status: l.status, results: l.results, createdAt: l.createdAt }))
      }
    });
  } catch (error) {
    console.error('Patient history error:', error);
    res.status(500).json({ error: 'Failed to generate patient history summary' });
  }
});

module.exports = router;
