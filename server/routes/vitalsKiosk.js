const express = require('express');
const { auth } = require('../middleware/auth');
const { queryOllama } = require('../services/ai');
const Appointment = require('../models/Appointment');
const Vitals = require('../models/Vitals');
const Patient = require('../models/Patient');
const Tesseract = require('tesseract.js');

const router = express.Router();

// Extract vitals values from OCR text using multi-strategy approach
// Handles both clean single-column text AND garbled 2-column interleaved OCR
function parseVitalsFromText(text) {
  const vitals = {};
  const clean = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // ── STRATEGY 1: Unit-anchored patterns (highest confidence) ──
  // These work regardless of text ordering because they anchor on the unit

  // Blood Pressure: any X/Y pattern (unique format, always reliable)
  const bpMatch = clean.match(/(\d{2,3})\s*[\/\\]\s*(\d{2,3})\s*(?:mmhg|mm\s*hg)?/i)
    || clean.match(/(?:bp|blood\s*pressure)[:\s]*(\d{2,3})\s*[\/\\]\s*(\d{2,3})/i)
    || clean.match(/systolic[:\s]*(\d{2,3})[\s\S]*?diastolic[:\s]*(\d{2,3})/i);
  if (bpMatch) {
    vitals.bloodPressure = { systolic: parseInt(bpMatch[1]), diastolic: parseInt(bpMatch[2]) };
  }

  // Heart Rate: number before "bpm" (allow garbled "mmHg" between from 2-col OCR)
  const hrUnitMatch = clean.match(/(\d{2,3})\s*(?:mmhg\s*)?bpm/i);
  if (hrUnitMatch) vitals.heartRate = parseInt(hrUnitMatch[1]);

  // Temperature: number before °F/°C
  const tempUnitMatch = clean.match(/([\d.]+)\s*°\s*([fFcC])/i);
  if (tempUnitMatch) {
    let t = parseFloat(tempUnitMatch[1]);
    if (tempUnitMatch[2].toLowerCase() === 'c') t = t * 9 / 5 + 32;
    vitals.temperature = Math.round(t * 10) / 10;
  }

  // SpO2: number before "%" (allow garbled chars like "ie" from OCR mangling °F, etc)
  const spo2UnitMatch = clean.match(/(\d{2,3})\s*(?:[a-z]{0,3}\s*)?%/i);
  if (spo2UnitMatch) {
    const val = parseInt(spo2UnitMatch[1]);
    if (val >= 50 && val <= 100) vitals.oxygenSaturation = val;
  }

  // ── STRATEGY 2: Keyword-proximity with number claiming ──
  // Find all keywords and all numbers, then associate nearest unused numbers

  const keyDefs = [
    { key: 'heartRate', pat: /heart\s*rate|pulse/i, min: 30, max: 220 },
    { key: 'temperature', pat: /temp(?:erature)?/i, min: 90, max: 110, decimal: true },
    { key: 'oxygenSaturation', pat: /spo2|sp02|oxygen|o2\s*sat/i, min: 50, max: 100 },
    { key: 'respiratoryRate', pat: /resp(?:iratory)?\s*rate|\brr\b/i, min: 5, max: 60 },
    { key: 'weight', pat: /weight|\bwt\b/i, min: 1, max: 300, decimal: true },
    { key: 'height', pat: /height|\bht\b/i, min: 30, max: 250, decimal: true },
    { key: 'bloodSugar', pat: /blood\s*sugar|glucose/i, min: 20, max: 600, decimal: true },
  ];

  // Find all standalone numbers with positions
  const allNums = [];
  const numRe = /(?<!\w)(\d+\.?\d*)(?!\w*[\/\\]\d)/g; // Skip numbers inside BP pattern
  let nm;
  while ((nm = numRe.exec(clean)) !== null) {
    allNums.push({ val: nm[1], pos: nm.index, end: nm.index + nm[0].length });
  }

  // Mark numbers already claimed by Strategy 1
  const claimed = new Set();
  if (bpMatch) {
    allNums.forEach(n => {
      if (n.pos >= bpMatch.index && n.end <= bpMatch.index + bpMatch[0].length) claimed.add(n.pos);
    });
  }
  if (hrUnitMatch && vitals.heartRate) {
    allNums.forEach(n => {
      if (n.pos >= hrUnitMatch.index && n.end <= hrUnitMatch.index + hrUnitMatch[0].length) claimed.add(n.pos);
    });
  }
  if (spo2UnitMatch && vitals.oxygenSaturation) {
    allNums.forEach(n => {
      if (n.pos >= spo2UnitMatch.index && n.end <= spo2UnitMatch.index + spo2UnitMatch[0].length) claimed.add(n.pos);
    });
  }
  if (tempUnitMatch && vitals.temperature) {
    allNums.forEach(n => {
      if (n.pos >= tempUnitMatch.index && n.end <= tempUnitMatch.index + tempUnitMatch[0].length) claimed.add(n.pos);
    });
  }

  // Find keyword positions (only for vitals not yet extracted)
  const kwPositions = [];
  for (const def of keyDefs) {
    if (vitals[def.key] != null) continue;
    const m = clean.match(def.pat);
    if (m) kwPositions.push({ ...def, pos: m.index, end: m.index + m[0].length });
  }
  kwPositions.sort((a, b) => a.pos - b.pos);

  // For each keyword, find the nearest unclaimed number after it within range
  for (const kw of kwPositions) {
    if (vitals[kw.key] != null) continue;

    for (const num of allNums) {
      if (num.pos < kw.end) continue;       // Must come after keyword
      if (claimed.has(num.pos)) continue;    // Already used
      if (num.pos > kw.end + 80) break;      // Too far

      const val = kw.decimal ? parseFloat(num.val) : parseInt(num.val);
      if (val >= kw.min && val <= kw.max) {
        vitals[kw.key] = kw.decimal ? Math.round(val * 10) / 10 : val;
        claimed.add(num.pos);
        break;
      }
    }
  }

  // ── STRATEGY 3: Smart defaults for common OCR patterns ──
  // If temperature not found, look for any decimal in body-temp range
  if (!vitals.temperature) {
    const tempGuess = clean.match(/\b(9[5-9]\.\d|10[0-8]\.\d)\b/);
    if (tempGuess) vitals.temperature = parseFloat(tempGuess[1]);
  }

  // Temperature: if found but in Celsius range, convert
  if (vitals.temperature && vitals.temperature < 50) {
    vitals.temperature = Math.round((vitals.temperature * 9 / 5 + 32) * 10) / 10;
  }

  return vitals;
}

// Validate parsed vitals are in reasonable medical ranges
function validateVitals(vitals) {
  const valid = {};
  const issues = [];

  if (vitals.bloodPressure) {
    const { systolic, diastolic } = vitals.bloodPressure;
    if (systolic >= 60 && systolic <= 250 && diastolic >= 30 && diastolic <= 150) {
      valid.bloodPressure = vitals.bloodPressure;
    } else {
      issues.push('Blood pressure values out of range');
    }
  }
  if (vitals.heartRate && vitals.heartRate >= 30 && vitals.heartRate <= 220) {
    valid.heartRate = vitals.heartRate;
  } else if (vitals.heartRate) {
    issues.push('Heart rate out of range');
  }
  if (vitals.temperature && vitals.temperature >= 90 && vitals.temperature <= 110) {
    valid.temperature = vitals.temperature;
  } else if (vitals.temperature) {
    issues.push('Temperature out of range');
  }
  if (vitals.oxygenSaturation && vitals.oxygenSaturation >= 50 && vitals.oxygenSaturation <= 100) {
    valid.oxygenSaturation = vitals.oxygenSaturation;
  } else if (vitals.oxygenSaturation) {
    issues.push('SpO2 out of range');
  }
  if (vitals.respiratoryRate && vitals.respiratoryRate >= 5 && vitals.respiratoryRate <= 60) {
    valid.respiratoryRate = vitals.respiratoryRate;
  }
  if (vitals.weight && vitals.weight >= 1 && vitals.weight <= 300) {
    valid.weight = vitals.weight;
  }
  if (vitals.height && vitals.height >= 30 && vitals.height <= 250) {
    valid.height = vitals.height;
  }
  if (vitals.bloodSugar && vitals.bloodSugar >= 20 && vitals.bloodSugar <= 600) {
    valid.bloodSugar = vitals.bloodSugar;
  }

  return { valid, issues };
}

// GET /api/vitals-kiosk/my-history — Patient's past vitals records
router.get('/my-history', auth, async (req, res) => {
  try {
    const vitals = await Vitals.find({ patientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json(vitals);
  } catch (error) {
    console.error('Vitals history error:', error.message);
    res.json([]);
  }
});

// POST /api/vitals-kiosk/:appointmentId/scan — OCR extract vitals from photo
router.post('/:appointmentId/scan', auth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const appointment = await Appointment.findById(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Ensure patient owns this appointment
    if (appointment.patientId.toString() !== req.user._id.toString() && !['doctor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Extract base64 data (strip data URI prefix if present)
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    // Run OCR
    console.log('🔍 Running OCR on kiosk image...');
    const { data: { text: ocrText } } = await Tesseract.recognize(imgBuffer, 'eng', {
      logger: () => {} // suppress progress logs
    });

    console.log('📝 OCR extracted text:', ocrText);

    // Parse vitals from OCR text
    const parsed = parseVitalsFromText(ocrText);
    const { valid, issues } = validateVitals(parsed);

    // Count how many vitals were extracted
    const fieldCount = Object.keys(valid).length;

    res.json({
      success: true,
      ocrText: ocrText.trim(),
      extractedVitals: valid,
      fieldsFound: fieldCount,
      issues,
      message: fieldCount > 0
        ? `Extracted ${fieldCount} vital sign${fieldCount > 1 ? 's' : ''} from the image.`
        : 'Could not extract vitals from the image. Please try a clearer photo or enter manually.'
    });
  } catch (error) {
    console.error('🚨 Vitals kiosk scan error:', error.message);
    res.status(500).json({ error: 'Failed to process image. Please try again.' });
  }
});

// POST /api/vitals-kiosk/:appointmentId/save — Save vitals + AI summary
router.post('/:appointmentId/save', auth, async (req, res) => {
  try {
    const { vitals: vitalsData } = req.body;
    if (!vitalsData) {
      return res.status(400).json({ error: 'No vitals data provided' });
    }

    const appointment = await Appointment.findById(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.patientId.toString() !== req.user._id.toString() && !['doctor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Create vitals record
    const vitals = await Vitals.create({
      ...vitalsData,
      patientId: appointment.patientId,
      appointmentId: appointment._id,
      recordedBy: req.user._id,
      notes: 'Recorded via Vitals Kiosk (photo scan)'
    });

    // Calculate BMI
    if (vitals.weight && vitals.height) {
      vitals.bmi = +(vitals.weight / ((vitals.height / 100) ** 2)).toFixed(1);
    }

    // Run triage assessment (instant, rule-based)
    let triageLevel = 'green';
    const flags = [];
    if (vitalsData.bloodPressure) {
      const { systolic, diastolic } = vitalsData.bloodPressure;
      if (systolic >= 180 || diastolic >= 120) { triageLevel = 'red'; flags.push(`Critical BP: ${systolic}/${diastolic} mmHg — hypertensive crisis`); }
      else if (systolic >= 140 || diastolic >= 90) { triageLevel = 'orange'; flags.push(`High BP: ${systolic}/${diastolic} mmHg — stage 2 hypertension`); }
      else if (systolic >= 130 || diastolic >= 85) { triageLevel = 'yellow'; flags.push(`Elevated BP: ${systolic}/${diastolic} mmHg — pre-hypertension`); }
      else { flags.push(`BP: ${systolic}/${diastolic} mmHg — normal`); }
    }
    if (vitalsData.heartRate) {
      if (vitalsData.heartRate > 120) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Tachycardia: HR ${vitalsData.heartRate} bpm (>120)`); }
      else if (vitalsData.heartRate < 50) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Bradycardia: HR ${vitalsData.heartRate} bpm (<50)`); }
      else { flags.push(`HR: ${vitalsData.heartRate} bpm — normal`); }
    }
    if (vitalsData.temperature) {
      if (vitalsData.temperature >= 104) { triageLevel = triageLevel === 'green' ? 'red' : triageLevel; flags.push(`High fever: ${vitalsData.temperature}°F — urgent medical attention needed`); }
      else if (vitalsData.temperature >= 100.4) { triageLevel = triageLevel === 'green' ? 'yellow' : triageLevel; flags.push(`Fever: ${vitalsData.temperature}°F — monitor closely`); }
      else if (vitalsData.temperature < 95) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Hypothermia: ${vitalsData.temperature}°F`); }
      else { flags.push(`Temperature: ${vitalsData.temperature}°F — normal`); }
    }
    if (vitalsData.oxygenSaturation) {
      if (vitalsData.oxygenSaturation < 90) { triageLevel = 'red'; flags.push(`Critical SpO2: ${vitalsData.oxygenSaturation}% — supplemental oxygen needed`); }
      else if (vitalsData.oxygenSaturation < 94) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Low SpO2: ${vitalsData.oxygenSaturation}% — borderline hypoxemia`); }
      else { flags.push(`SpO2: ${vitalsData.oxygenSaturation}% — normal`); }
    }
    if (vitalsData.respiratoryRate) {
      if (vitalsData.respiratoryRate > 24) { triageLevel = triageLevel === 'green' ? 'yellow' : triageLevel; flags.push(`Tachypnea: RR ${vitalsData.respiratoryRate}/min`); }
      else if (vitalsData.respiratoryRate < 10) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Bradypnea: RR ${vitalsData.respiratoryRate}/min`); }
      else { flags.push(`RR: ${vitalsData.respiratoryRate}/min — normal`); }
    }
    if (vitalsData.bloodSugar) {
      if (vitalsData.bloodSugar > 300) { triageLevel = triageLevel === 'green' ? 'red' : triageLevel; flags.push(`Critical hyperglycemia: ${vitalsData.bloodSugar} mg/dL`); }
      else if (vitalsData.bloodSugar > 200) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`High blood sugar: ${vitalsData.bloodSugar} mg/dL — needs evaluation`); }
      else if (vitalsData.bloodSugar > 140) { triageLevel = triageLevel === 'green' ? 'yellow' : triageLevel; flags.push(`Elevated glucose: ${vitalsData.bloodSugar} mg/dL — pre-diabetic range`); }
      else if (vitalsData.bloodSugar < 70) { triageLevel = triageLevel === 'green' ? 'orange' : triageLevel; flags.push(`Hypoglycemia: ${vitalsData.bloodSugar} mg/dL — low blood sugar`); }
      else { flags.push(`Blood Sugar: ${vitalsData.bloodSugar} mg/dL — normal`); }
    }
    if (vitals.bmi) {
      if (vitals.bmi >= 30) flags.push(`BMI: ${vitals.bmi} — obese`);
      else if (vitals.bmi >= 25) flags.push(`BMI: ${vitals.bmi} — overweight`);
      else if (vitals.bmi < 18.5) flags.push(`BMI: ${vitals.bmi} — underweight`);
      else flags.push(`BMI: ${vitals.bmi} — normal weight`);
    }

    // Build instant clinical summary
    const riskLabel = { green: 'Low Risk', yellow: 'Mild Concern', orange: 'Moderate Risk', red: 'High Risk' }[triageLevel];
    const abnormals = flags.filter(f => !f.includes('normal'));
    const instantSummary = abnormals.length > 0
      ? `Triage: ${riskLabel}. ${abnormals.join('. ')}. ${flags.filter(f => f.includes('normal')).length} vital(s) within normal range.`
      : `Triage: ${riskLabel}. All recorded vitals are within normal physiological ranges. No immediate concerns identified.`;

    vitals.triageLevel = triageLevel;
    vitals.aiTriageAssessment = instantSummary;
    await vitals.save();

    // Update appointment status
    appointment.status = 'vitals-done';
    await appointment.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`patient-${appointment.patientId}`).emit('vitals-recorded', { vitals });
    }

    // Transition workflow state
    try {
      const WorkflowState = require('../models/WorkflowState');
      await WorkflowState.findOneAndUpdate(
        { appointmentId: appointment._id, isActive: true },
        {
          currentState: 'VITALS_RECORDED',
          $push: { stateHistory: { state: 'VITALS_RECORDED', enteredAt: new Date(), metadata: { source: 'kiosk-scan' } } }
        }
      );
    } catch { /* workflow transition optional */ }

    // Send instant response (don't wait for AI)
    res.json({
      success: true,
      vitals,
      triageLevel,
      aiSummary: instantSummary,
      bmi: vitals.bmi || null,
      message: 'Vitals recorded successfully via kiosk scan.'
    });

    // Fire-and-forget: Generate detailed AI summary in background
    (async () => {
      try {
        const patient = await Patient.findOne({ userId: appointment.patientId }).lean();
        const currentVitalsStr = flags.join('. ');
        const patientInfo = patient ? [
          patient.gender ? `Gender: ${patient.gender}` : null,
          patient.bloodGroup ? `Blood Group: ${patient.bloodGroup}` : null,
          patient.allergies?.length ? `Allergies: ${patient.allergies.join(', ')}` : null,
          patient.chronicConditions?.length ? `Chronic Conditions: ${patient.chronicConditions.join(', ')}` : null,
          patient.currentMedications?.length ? `Medications: ${patient.currentMedications.join(', ')}` : null,
        ].filter(Boolean).join('. ') : 'New patient';

        const aiPrompt = `Brief clinical summary (3 sentences max):\nVitals: ${currentVitalsStr}\nPatient: ${patientInfo}\nRisk: ${riskLabel}\nAssess and flag concerns.`;
        const aiResult = await queryOllama(aiPrompt, 'You are a medical AI. Be concise.');
        if (aiResult) {
          await Vitals.findByIdAndUpdate(vitals._id, { aiTriageAssessment: aiResult });
          if (io) io.to(`patient-${appointment.patientId}`).emit('vitals-ai-updated', { vitalsId: vitals._id, aiSummary: aiResult });
        }
      } catch (err) {
        console.log('⚡ Background AI summary skipped:', err.message);
      }
    })();
  } catch (error) {
    console.error('🚨 Vitals kiosk save error:', error.message);
    res.status(500).json({ error: 'Failed to save vitals' });
  }
});

module.exports = router;
