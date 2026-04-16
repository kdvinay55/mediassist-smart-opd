const OpenAI = require('openai');

// Initialize OpenAI client — gracefully handle missing API key
let openai = null;
try {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (err) {
  console.warn('⚠️ OpenAI client init failed:', err.message);
}

// Model routing: medical analysis uses gpt-4.1, normal tasks use gpt-4.1-mini
const MODEL_MEDICAL = process.env.OPENAI_MODEL_MEDICAL || 'gpt-4.1';
const MODEL_NORMAL = process.env.OPENAI_MODEL_NORMAL || 'gpt-4.1-mini';

// No warmup needed for OpenAI API
async function warmupModel() {
  if (openai) {
    console.log('✅ OpenAI API configured — models:', MODEL_MEDICAL, '(medical),', MODEL_NORMAL, '(normal)');
  } else {
    console.warn('⚠️ OPENAI_API_KEY not set — AI features will return fallback responses. Set it in .env');
  }
}
warmupModel();

/**
 * Query OpenAI chat completions
 * @param {string} prompt - User message
 * @param {string} systemPrompt - System instructions
 * @param {object} options - { model, temperature, maxTokens }
 */
async function queryAI(prompt, systemPrompt = '', options = {}) {
  if (!openai) {
    console.warn('OpenAI not configured — returning null');
    return null;
  }

  const model = options.model || MODEL_NORMAL;
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 512;

  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const result = response.choices?.[0]?.message?.content;
    if (!result || typeof result !== 'string') {
      console.warn('OpenAI returned empty response');
      return null;
    }

    return result.trim();
  } catch (error) {
    console.error('OpenAI error:', error.message);
    return null;
  }
}

// Backward-compatible alias (used by assistant.js and vitalsKiosk.js)
async function queryOllama(prompt, systemPrompt = '') {
  return queryAI(prompt, systemPrompt, { model: MODEL_NORMAL });
}

async function generateTriageAssessment(vitals) {
  const prompt = `Based on these vitals, provide a triage assessment:
- Blood Pressure: ${vitals.bloodPressure?.systolic}/${vitals.bloodPressure?.diastolic} mmHg
- Heart Rate: ${vitals.heartRate} bpm
- Temperature: ${vitals.temperature}°F
- SpO2: ${vitals.oxygenSaturation}%
- Respiratory Rate: ${vitals.respiratoryRate} breaths/min
- Pain Level: ${vitals.painLevel}/10

Provide: 1) Triage level (green/yellow/orange/red), 2) Key concerns, 3) Priority recommendation. Be concise.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL });
}

async function generateDiagnosis(symptoms, vitals, history) {
  const prompt = `Patient presents with:
Symptoms: ${symptoms.join(', ')}
${vitals ? `Vitals: BP ${vitals.bloodPressure?.systolic}/${vitals.bloodPressure?.diastolic}, HR ${vitals.heartRate}, Temp ${vitals.temperature}°F, SpO2 ${vitals.oxygenSaturation}%` : ''}
${history ? `History: ${history}` : ''}

Provide: 1) Top 3 differential diagnoses with confidence %, 2) Recommended tests, 3) Initial treatment considerations. Format as structured JSON.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL, maxTokens: 1024 });
}

async function interpretLabResults(results) {
  const formatted = results.map(r => `${r.parameter}: ${r.value} ${r.unit} (ref: ${r.referenceRange})`).join('\n');
  const prompt = `Interpret these lab results:\n${formatted}\n\nProvide: 1) Summary of findings, 2) Abnormal values and their significance, 3) Recommended follow-up. Be concise and clinical.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL });
}

async function generateTreatmentPlan(diagnosis, patientInfo) {
  const prompt = `Generate a treatment plan for:
Diagnosis: ${diagnosis}
${patientInfo ? `Patient: ${patientInfo}` : ''}

Provide: 1) Medications with dosage, 2) Lifestyle modifications, 3) Follow-up schedule, 4) Warning signs to watch for. Be specific and practical.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL, maxTokens: 1024 });
}

async function chatWithAI(message, context = '') {
  const systemPrompt = `You are a medical AI assistant in a hospital OPD setting. ${context ? `Context: ${context}` : ''} 
Provide helpful, accurate medical information. Always note that your suggestions should be verified by the treating physician.`;

  return queryAI(message, systemPrompt, { model: MODEL_NORMAL });
}

async function generatePatientHistorySummary(patientData) {
  const prompt = `Summarize this patient's medical history for a doctor consultation:

Patient: ${patientData.name}, Age: ${patientData.age}, Gender: ${patientData.gender}
Blood Group: ${patientData.bloodGroup || 'Unknown'}
Allergies: ${patientData.allergies?.join(', ') || 'None'}
Chronic Conditions: ${patientData.chronicConditions?.join(', ') || 'None'}

Past Consultations:
${patientData.consultations?.map(c => `- ${c.date}: ${c.chiefComplaint || 'N/A'} → Diagnosis: ${c.finalDiagnosis?.map(d => d.condition || d).join(', ') || c.aiSuggestedDiagnosis?.map(d => d.condition).join(', ') || 'Pending'}`).join('\n') || 'No past consultations'}

Recent Vitals:
${patientData.vitals ? `BP: ${patientData.vitals.bloodPressure?.systolic}/${patientData.vitals.bloodPressure?.diastolic}, HR: ${patientData.vitals.heartRate}, Temp: ${patientData.vitals.temperature}°F, SpO2: ${patientData.vitals.oxygenSaturation}%` : 'No vitals recorded'}

Current Medications:
${patientData.medications?.map(m => `- ${m.name} ${m.dosage} (${m.frequency})`).join('\n') || 'None'}

Recent Lab Results:
${patientData.labResults?.map(l => `- ${l.testName}: ${l.status === 'completed' ? l.results?.map(r => `${r.parameter}: ${r.value} ${r.unit}`).join(', ') : l.status}`).join('\n') || 'None'}

Provide a concise clinical narrative: 1) Key medical history, 2) Current health status, 3) Active concerns, 4) Points to discuss in consultation.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL, maxTokens: 1024 });
}

async function generateWellnessPlan(patientData) {
  const prompt = `Generate a personalized wellness plan for this patient:

Patient: ${patientData.name}, Age: ${patientData.age}, Gender: ${patientData.gender}
BMI: ${patientData.bmi || 'Unknown'}
Diagnoses: ${patientData.diagnoses?.join(', ') || 'None'}
Chronic Conditions: ${patientData.chronicConditions?.join(', ') || 'None'}
Allergies: ${patientData.allergies?.join(', ') || 'None'}
Current Medications: ${patientData.medications?.map(m => `${m.name} ${m.dosage}`).join(', ') || 'None'}
Vitals: ${patientData.vitals ? `BP: ${patientData.vitals.bloodPressure?.systolic}/${patientData.vitals.bloodPressure?.diastolic}, HR: ${patientData.vitals.heartRate}` : 'N/A'}

Provide a comprehensive wellness plan with:
1) Diet recommendations (specific foods to eat and avoid)
2) Exercise plan (type, duration, frequency)
3) Sleep hygiene recommendations
4) Stress management techniques
5) Preventive health screenings recommended
6) Lifestyle modifications specific to their conditions
7) Warning signs to watch for

Be practical and specific to their conditions.`;

  return queryAI(prompt, '', { model: MODEL_MEDICAL, maxTokens: 1024 });
}

async function generateReferralLetter(referralData) {
  const prompt = `Generate a professional medical referral letter:

Referring Doctor: Dr. ${referralData.referringDoctor}
Department: ${referralData.fromDepartment}
Patient: ${referralData.patientName}, Age: ${referralData.patientAge}
Referred To: ${referralData.toDepartment}${referralData.toDoctor ? ` (Dr. ${referralData.toDoctor})` : ''}
Urgency: ${referralData.urgency}

Reason for Referral: ${referralData.reason}
Current Diagnosis: ${referralData.diagnosis || 'Under evaluation'}
Relevant History: ${referralData.history || 'See attached records'}
Current Medications: ${referralData.medications || 'None'}

Generate a concise, professional referral letter. Include clinical summary and specific questions for the specialist.`;

  return queryAI(prompt, '', { model: MODEL_NORMAL });
}

// Transcribe audio using OpenAI Whisper
async function transcribeAudio(audioBuffer, filename = 'audio.webm') {
  if (!openai) {
    console.warn('OpenAI not configured — transcription unavailable');
    return null;
  }

  try {
    const { toFile } = require('openai');
    const file = await toFile(audioBuffer, filename, { type: 'audio/webm' });
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'en'
    });
    return response.text;
  } catch (error) {
    console.error('Whisper transcription error:', error.message);
    return null;
  }
}

module.exports = { queryOllama, queryAI, warmupModel, generateTriageAssessment, generateDiagnosis, interpretLabResults, generateTreatmentPlan, chatWithAI, generatePatientHistorySummary, generateWellnessPlan, generateReferralLetter, transcribeAudio };
