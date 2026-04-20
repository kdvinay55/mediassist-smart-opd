const OpenAIAssistantGateway = require('./OpenAIAssistantGateway');
const MedicalService = require('./MedicalService');
const IntentService = require('./IntentService');
const { ASSISTANT_MODELS, ASSISTANT_THRESHOLDS, SUPPORTED_LANGUAGES } = require('./config');

const FALLBACK_EN = "I'm sorry, I didn't understand. Please try again.";
const LANGUAGE_SCRIPTS = Object.freeze({
  te: /[\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  en: /[A-Za-z]/
});

function normalizeLanguage(code) {
  const normalized = String(code || '').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.some((entry) => entry.code === normalized) ? normalized : 'en';
}

function clampConfidence(value, fallback = 0.8) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function responseShowsLanguage(text, language) {
  const matcher = LANGUAGE_SCRIPTS[normalizeLanguage(language)];
  return Boolean(matcher && matcher.test(String(text || '')));
}

function resolveTranslationMode(language, confidenceScore, explicitMode) {
  if (explicitMode) {
    return explicitMode;
  }
  if (confidenceScore < ASSISTANT_THRESHOLDS.languageConfidence) {
    return 'automatic_detection';
  }
  return normalizeLanguage(language) === 'en'
    ? 'native'
    : 'same_language_response';
}

function languageLabelFor(code) {
  return SUPPORTED_LANGUAGES.find((entry) => entry.code === code)?.label || 'English';
}

function requiresMedicalReasoning(text) {
  return /\b(symptom|symptoms|fever|cough|pain|headache|vomit|dizzy|rash|infection|sugar|diabetes|blood pressure|hypertension|lab|result|results|medication|medicine|dose|treatment|diagnosis|history|chest pain|breathing)\b/i.test(text || '');
}

function stripCodeFence(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function parseJsonObject(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildFallbackDiagnosis(symptoms = []) {
  const primary = symptoms.slice(0, 3).filter(Boolean).join(', ');
  return [{
    condition: primary ? `Requires clinician evaluation for: ${primary}` : 'Requires clinician evaluation based on reported symptoms',
    confidence: 45
  }];
}

function parseDiagnosisResponse(rawText, symptoms = []) {
  const parsed = parseJsonObject(rawText);
  if (parsed?.diagnoses && Array.isArray(parsed.diagnoses) && parsed.diagnoses.length > 0) {
    return parsed.diagnoses
      .map((entry, index) => ({
        condition: String(entry.condition || entry.name || '').trim(),
        confidence: Number(entry.confidence) || Math.max(40, 80 - index * 10)
      }))
      .filter((entry) => entry.condition);
  }

  const lines = stripCodeFence(rawText)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((condition, index) => ({
      condition,
      confidence: Math.max(40, 80 - index * 10)
    }));

  return lines.length > 0 ? lines : buildFallbackDiagnosis(symptoms);
}

function formatResultsForPrompt(results = []) {
  return results.map((result) => {
    const unit = result.unit ? ` ${result.unit}` : '';
    const reference = result.referenceRange ? ` (ref: ${result.referenceRange})` : '';
    const flag = result.flag ? ` [${result.flag}]` : '';
    return `- ${result.parameter}: ${result.value}${unit}${reference}${flag}`;
  }).join('\n');
}

function buildFallbackLabInterpretation(results = []) {
  const flagged = results.filter((result) => ['high', 'low', 'critical'].includes(result.flag));
  if (flagged.length === 0) {
    return 'Most listed lab values appear within the provided reference ranges. Please review the results with your doctor for clinical interpretation.';
  }

  const summary = flagged.map((result) => `${result.parameter} is ${result.flag}`).join(', ');
  return `The main abnormal findings are: ${summary}. Please discuss these results with your doctor, especially if you have symptoms or existing medical conditions.`;
}

function buildFallbackHistorySummary(patientData = {}) {
  const problems = [];
  if (patientData.chronicConditions?.length) {
    problems.push(`Chronic conditions: ${patientData.chronicConditions.join(', ')}`);
  }
  if (patientData.allergies?.length) {
    problems.push(`Allergies: ${patientData.allergies.join(', ')}`);
  }
  if (patientData.medications?.length) {
    problems.push(`Active medications: ${patientData.medications.map((entry) => entry.name).join(', ')}`);
  }

  const consultationCount = patientData.consultations?.length || 0;
  const labCount = patientData.labResults?.length || 0;
  const summaryBits = [
    `${patientData.name || 'Patient'} has ${consultationCount} recent consultation${consultationCount === 1 ? '' : 's'}`,
    `${labCount} recent lab result${labCount === 1 ? '' : 's'}`
  ];

  if (problems.length > 0) {
    summaryBits.push(problems.join('. '));
  }

  return `${summaryBits.join('. ')}. Review the structured records below for full detail.`;
}

function buildFallbackReferralLetter(details = {}) {
  return [
    `Referral: ${details.urgency || 'routine'}`,
    `From: Dr. ${details.referringDoctor || 'Referring clinician'} (${details.fromDepartment || 'General'})`,
    `To: ${details.toDepartment || 'Specialist department'}${details.toDoctor ? ` - Dr. ${details.toDoctor}` : ''}`,
    `Patient: ${details.patientName || 'Patient'}${details.patientAge ? `, Age ${details.patientAge}` : ''}`,
    `Reason: ${details.reason || 'Specialist review requested.'}`,
    `Working diagnosis: ${details.diagnosis || 'To be assessed'}`,
    `Relevant history: ${details.history || 'Not provided'}`,
    `Current medications: ${details.medications || 'None listed'}`,
    'Please review the patient and advise further management.'
  ].join('\n');
}

function buildFallbackWellnessPlan(patientData = {}) {
  const diagnosisText = patientData.diagnoses?.length
    ? `Known concerns: ${patientData.diagnoses.join(', ')}.`
    : 'No major diagnosis list was available in the generated context.';

  return [
    'Diet:',
    '- Prefer balanced meals with vegetables, protein, and adequate hydration.',
    '- Limit excess sugar, salt, and highly processed foods.',
    '',
    'Exercise:',
    '- Aim for regular walking or light exercise on most days unless your doctor has restricted activity.',
    '',
    'Sleep:',
    '- Keep a consistent sleep schedule and target 7 to 9 hours of rest.',
    '',
    'Monitoring:',
    `- ${diagnosisText}`,
    '- Continue prescribed medications and attend follow-up visits as scheduled.',
    '',
    'Safety:',
    '- Contact your doctor if symptoms worsen or new warning signs appear.'
  ].join('\n');
}

function buildFallbackTriageAssessment(vitals = {}) {
  const details = [];
  let triageLevel = 'green';
  let level = 'Normal';

  if (vitals.bp || vitals.bloodPressure) {
    const bp = vitals.bp || vitals.bloodPressure;
    const systolic = Number(bp.systolic || String(bp).split('/')[0]);
    const diastolic = Number(bp.diastolic || String(bp).split('/')[1]);
    if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
      details.push(`Blood pressure ${systolic}/${diastolic} mmHg`);
      if (systolic >= 180 || diastolic >= 120) {
        triageLevel = 'red';
        level = 'High';
      } else if (systolic >= 140 || diastolic >= 90) {
        triageLevel = 'orange';
        level = 'High';
      } else if (systolic >= 130 || diastolic >= 85) {
        triageLevel = 'yellow';
        level = 'Medium';
      }
    }
  }

  const heartRate = Number(vitals.hr || vitals.heartRate);
  if (Number.isFinite(heartRate)) {
    details.push(`Heart rate ${heartRate} bpm`);
    if (heartRate > 120 || heartRate < 50) {
      triageLevel = triageLevel === 'green' ? 'orange' : triageLevel;
      level = triageLevel === 'yellow' ? 'Medium' : 'High';
    }
  }

  const temperature = Number(vitals.temp || vitals.temperature);
  if (Number.isFinite(temperature)) {
    details.push(`Temperature ${temperature}°F`);
    if (temperature >= 104 || temperature < 95) {
      triageLevel = triageLevel === 'green' ? 'red' : triageLevel;
      level = 'High';
    } else if (temperature >= 100.4 && triageLevel === 'green') {
      triageLevel = 'yellow';
      level = 'Medium';
    }
  }

  const spo2 = Number(vitals.spo2 || vitals.oxygenSaturation);
  if (Number.isFinite(spo2)) {
    details.push(`SpO2 ${spo2}%`);
    if (spo2 < 90) {
      triageLevel = 'red';
      level = 'High';
    } else if (spo2 < 94 && triageLevel === 'green') {
      triageLevel = 'orange';
      level = 'High';
    }
  }

  return {
    triageLevel,
    level,
    assessment: details.length > 0
      ? `Initial triage assessment based on ${details.join(', ')}. Please review with a clinician for a full medical decision.`
      : 'Initial triage assessment unavailable because no usable vitals were supplied.'
  };
}

class UnifiedAssistantService {
  constructor({ gateway, medicalService, intentService, logger } = {}) {
    this.logger = logger;
    this.gateway = gateway || new OpenAIAssistantGateway({ logger: this.log.bind(this) });
    this.medicalService = medicalService || new MedicalService({ logger: this.log.bind(this) });
    this.intentService = intentService || new IntentService({ logger: this.log.bind(this), openaiClient: this.gateway.client });
  }

  log(event, payload = {}) {
    this.logger?.(event, payload);
  }

  async ensureResponseLanguage(text, targetLanguage) {
    const normalizedTargetLanguage = normalizeLanguage(targetLanguage);
    if (!text) {
      return text;
    }
    if (responseShowsLanguage(text, normalizedTargetLanguage)) {
      return text;
    }
    if (normalizedTargetLanguage === 'en' && /[A-Za-z]/.test(text)) {
      return text;
    }
    return this.gateway.translateText(text, normalizedTargetLanguage);
  }

  async buildCommandPlan({ text, language, sessionLanguage, confidenceScore, translationMode, conversationHistory = [], userId } = {}) {
    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      throw new Error('No command text provided');
    }

    const normalizedSessionLanguage = sessionLanguage ? normalizeLanguage(sessionLanguage) : null;
    const normalizedInputLanguage = language ? normalizeLanguage(language) : null;
    const resolvedConfidenceScore = clampConfidence(
      Number.isFinite(confidenceScore) ? confidenceScore : normalizedInputLanguage ? 0.82 : 0.55,
      normalizedInputLanguage ? 0.82 : 0.55
    );
    const shouldTrustProvidedLanguage = Boolean(
      normalizedInputLanguage && resolvedConfidenceScore >= ASSISTANT_THRESHOLDS.languageConfidence
    );
    const detectedLanguage = shouldTrustProvidedLanguage
      ? normalizedInputLanguage
      : await this.gateway.detectLanguage(trimmedText, normalizedSessionLanguage || normalizedInputLanguage);
    const replyLanguage = detectedLanguage || normalizedSessionLanguage || 'en';
    const englishText = replyLanguage === 'en'
      ? trimmedText
      : await this.gateway.translateText(trimmedText, 'en');
    const detection = await this.intentService.detectIntent(englishText);
    const shouldExecuteIntent = Boolean(
      userId
      && detection.intent !== 'GENERAL_CHAT'
      && detection.confidence >= ASSISTANT_THRESHOLDS.intentExecution
    );

    return {
      trimmedText,
      sessionLanguage: normalizedSessionLanguage,
      detectedLanguage: normalizeLanguage(detectedLanguage),
      replyLanguage: normalizeLanguage(replyLanguage),
      englishText,
      detection,
      shouldExecuteIntent,
      requiresMedical: requiresMedicalReasoning(englishText),
      confidenceScore: resolvedConfidenceScore,
      translationMode: resolveTranslationMode(replyLanguage, resolvedConfidenceScore, translationMode),
      conversationHistory,
      userId
    };
  }

  buildResponsePayload(plan, payload = {}) {
    const responseLanguage = normalizeLanguage(payload.language || plan.replyLanguage || plan.detectedLanguage || 'en');
    return {
      ...payload,
      language: responseLanguage,
      responseLanguage,
      response_language: responseLanguage,
      detectedLanguage: plan.detectedLanguage,
      detected_language: plan.detectedLanguage,
      confidenceScore: plan.confidenceScore,
      confidence_score: plan.confidenceScore,
      translationMode: plan.translationMode,
      translation_mode: plan.translationMode
    };
  }

  async processCommand({ text, language, sessionLanguage, confidenceScore, translationMode, conversationHistory = [], userId } = {}) {
    const plan = await this.buildCommandPlan({
      text,
      language,
      sessionLanguage,
      confidenceScore,
      translationMode,
      conversationHistory,
      userId
    });

    if (plan.shouldExecuteIntent) {
      const result = await this.intentService.execute(plan.detection.intent, plan.detection.entities || {}, { userId: plan.userId });
      const localized = await this.ensureResponseLanguage(result.message, plan.replyLanguage);

      return this.buildResponsePayload(plan, {
        type: 'command',
        intent: plan.detection.intent,
        confidence: plan.detection.confidence,
        intentThreshold: ASSISTANT_THRESHOLDS.intentExecution,
        entities: plan.detection.entities || {},
        response: localized,
        success: result.success,
        action: result.action || null,
        navigateTo: result.navigateTo || null,
        data: result.data || null
      });
    }

    const reply = plan.requiresMedical
      ? await this.medicalService.provideGuidance({
          message: plan.trimmedText,
          context: plan.conversationHistory.slice(-8).map((entry) => `${entry.role}: ${entry.content}`).join('\n'),
          language: languageLabelFor(plan.replyLanguage)
        })
      : await this.gateway.generateAssistantReply({
          message: plan.trimmedText,
          conversationHistory: plan.conversationHistory,
          language: plan.replyLanguage
        });

    const fallback = plan.replyLanguage === 'en'
      ? FALLBACK_EN
      : await this.gateway.translateText(FALLBACK_EN, plan.replyLanguage);

    const localizedReply = await this.ensureResponseLanguage(reply || fallback, plan.replyLanguage);

    return this.buildResponsePayload(plan, {
      type: 'chat',
      intent: plan.detection.intent,
      confidence: plan.detection.confidence,
      intentThreshold: ASSISTANT_THRESHOLDS.intentExecution,
      response: localizedReply,
      success: Boolean(localizedReply)
    });
  }

  async streamCommand({ text, language, sessionLanguage, confidenceScore, translationMode, conversationHistory = [], userId, onEvent } = {}) {
    const emit = (type, payload = {}) => {
      if (typeof onEvent === 'function') {
        onEvent({ type, ...payload });
      }
    };

    const plan = await this.buildCommandPlan({
      text,
      language,
      sessionLanguage,
      confidenceScore,
      translationMode,
      conversationHistory,
      userId
    });

    emit('meta', {
      detectedLanguage: plan.detectedLanguage,
      detected_language: plan.detectedLanguage,
      responseLanguage: plan.replyLanguage,
      response_language: plan.replyLanguage,
      confidenceScore: plan.confidenceScore,
      confidence_score: plan.confidenceScore,
      translationMode: plan.translationMode,
      translation_mode: plan.translationMode,
      intent: plan.detection.intent,
      intentThreshold: ASSISTANT_THRESHOLDS.intentExecution,
      streaming: !plan.shouldExecuteIntent
    });

    if (plan.shouldExecuteIntent) {
      const result = await this.intentService.execute(plan.detection.intent, plan.detection.entities || {}, { userId: plan.userId });
      const localized = await this.ensureResponseLanguage(result.message, plan.replyLanguage);
      emit('delta', { delta: localized });
      return this.buildResponsePayload(plan, {
        type: 'command',
        intent: plan.detection.intent,
        confidence: plan.detection.confidence,
        intentThreshold: ASSISTANT_THRESHOLDS.intentExecution,
        entities: plan.detection.entities || {},
        response: localized,
        success: result.success,
        action: result.action || null,
        navigateTo: result.navigateTo || null,
        data: result.data || null
      });
    }

    let rawReply = '';
    const replyStream = plan.requiresMedical
      ? this.medicalService.streamGuidance({
          message: plan.trimmedText,
          context: plan.conversationHistory.slice(-8).map((entry) => `${entry.role}: ${entry.content}`).join('\n'),
          language: languageLabelFor(plan.replyLanguage)
        })
      : this.gateway.streamAssistantReply({
          message: plan.trimmedText,
          conversationHistory: plan.conversationHistory,
          language: plan.replyLanguage
        });

    for await (const delta of replyStream) {
      rawReply += delta;
      emit('delta', { delta });
    }

    const fallback = plan.replyLanguage === 'en'
      ? FALLBACK_EN
      : await this.gateway.translateText(FALLBACK_EN, plan.replyLanguage);
    const localizedReply = await this.ensureResponseLanguage(rawReply || fallback, plan.replyLanguage);

    return this.buildResponsePayload(plan, {
      type: 'chat',
      intent: plan.detection.intent,
      confidence: plan.detection.confidence,
      intentThreshold: ASSISTANT_THRESHOLDS.intentExecution,
      response: localizedReply,
      success: Boolean(localizedReply)
    });
  }

  async analyzeSymptoms({ message, symptoms = [], language = 'en' } = {}) {
    const userMessage = String(message || '').trim() || `I have these symptoms: ${symptoms.join(', ')}`;
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.medicalService.provideGuidance({
      message: `${userMessage}\n\nProvide a concise, easy-to-read answer with these headings:\nPossible conditions:\nRecommended department:\nUrgency level:\nImmediate self-care advice:`,
      language: languageLabelFor(normalizedLanguage)
    });

    return {
      response: response || 'Unable to generate a symptom assessment right now. Please book a consultation if symptoms persist or worsen.',
      language: normalizedLanguage,
      success: Boolean(response)
    };
  }

  async triageVitals({ vitals = {}, language = 'en' } = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const fallback = buildFallbackTriageAssessment(vitals);
    const prompt = `Vitals:\n${JSON.stringify(vitals, null, 2)}\n\nGive a short triage assessment in plain language. Mention urgency and the main reasons. Keep it under 4 sentences.`;
    const assessment = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You are MediAssist triage support for an OPD workflow. Reply in ${languageLabelFor(normalizedLanguage)}. Be concise, safety-focused, and non-diagnostic.`,
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 180
    });

    return {
      ...fallback,
      assessment: assessment || fallback.assessment,
      language: normalizedLanguage,
      success: Boolean(assessment)
    };
  }

  async generateConsultationDiagnosis({ consultation, vitals, history, language = 'en' } = {}) {
    const symptoms = consultation?.symptoms || [];
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You support a doctor in an outpatient consultation. Reply in JSON only using the shape {"diagnoses":[{"condition":"string","confidence":0-100}],"summary":"string"}. Provide a short differential diagnosis, not a definitive diagnosis.`,
      userPrompt: JSON.stringify({
        chiefComplaint: consultation?.chiefComplaint || '',
        symptoms,
        vitals: vitals || null,
        history: history || null,
        examination: consultation?.examination || '',
        notes: consultation?.notes || ''
      }, null, 2),
      temperature: 0.1,
      maxTokens: 260
    });

    const aiDiagnosis = parseDiagnosisResponse(response, symptoms);
    return {
      aiDiagnosis,
      rawResponse: response || aiDiagnosis.map((entry) => entry.condition).join(', ')
    };
  }

  async chatForConsultation({ consultation, message, language = 'en' } = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const context = [
      consultation?.chiefComplaint ? `Chief complaint: ${consultation.chiefComplaint}` : null,
      consultation?.symptoms?.length ? `Symptoms: ${consultation.symptoms.join(', ')}` : null,
      consultation?.examination ? `Examination: ${consultation.examination}` : null,
      consultation?.notes ? `Notes: ${consultation.notes}` : null,
      consultation?.finalDiagnosis?.length ? `Final diagnosis: ${consultation.finalDiagnosis.map((entry) => entry.condition || entry).join(', ')}` : null,
      consultation?.treatmentPlan ? `Treatment plan: ${consultation.treatmentPlan}` : null
    ].filter(Boolean).join('\n');

    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You assist a doctor during a consultation. Reply in ${languageLabelFor(normalizedLanguage)}. Be concise, clinically useful, and cautious.`,
      userPrompt: `Case context:\n${context || 'No structured context available.'}\n\nDoctor question:\n${message}`,
      temperature: 0.2,
      maxTokens: 220
    });

    return response || FALLBACK_EN;
  }

  async generateReferralLetter(details = {}, language = 'en') {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You draft concise professional referral letters for outpatient doctors. Reply in ${languageLabelFor(normalizedLanguage)}.`,
      userPrompt: `Draft a specialist referral letter using the following information:\n${JSON.stringify(details, null, 2)}`,
      temperature: 0.2,
      maxTokens: 320
    });

    return response || buildFallbackReferralLetter(details);
  }

  async summarizePatientHistory(patientData = {}, language = 'en') {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You summarize patient history for a doctor. Reply in ${languageLabelFor(normalizedLanguage)}. Focus on active problems, recent events, medications, labs, and follow-up needs.`,
      userPrompt: JSON.stringify(patientData, null, 2),
      temperature: 0.1,
      maxTokens: 260
    });

    return response || buildFallbackHistorySummary(patientData);
  }

  async interpretLabResults({ results = [], testName = '', language = 'en' } = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const summary = `Test: ${testName || 'Lab panel'}\n${formatResultsForPrompt(results)}`;
    const response = await this.medicalService.explainLabResults({
      labSummary: summary,
      language: languageLabelFor(normalizedLanguage)
    });

    return response || buildFallbackLabInterpretation(results);
  }

  async generateWellnessPlan(patientData = {}, language = 'en') {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You create practical, patient-friendly wellness plans for outpatient follow-up. Reply in ${languageLabelFor(normalizedLanguage)}. Use short sections for diet, exercise, sleep, stress, monitoring, and warning signs.`,
      userPrompt: JSON.stringify(patientData, null, 2),
      temperature: 0.2,
      maxTokens: 360
    });

    return response || buildFallbackWellnessPlan(patientData);
  }

  async generateTreatmentPlan({ diagnosis, vitals, history, language = 'en' } = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You assist a doctor in outlining a conservative outpatient treatment plan. Reply in ${languageLabelFor(normalizedLanguage)}. Do not prescribe exact medication doses.`,
      userPrompt: JSON.stringify({ diagnosis, vitals, history }, null, 2),
      temperature: 0.2,
      maxTokens: 220
    });

    return response || 'Treatment plan guidance is unavailable right now. Please document a clinician-reviewed plan manually.';
  }

  async generateKioskSummary({ currentVitalsSummary, patientInfo, riskLabel, language = 'en' } = {}) {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await this.gateway.complete({
      model: ASSISTANT_MODELS.medicalReasoning,
      systemPrompt: `You are MediAssist. Write a short clinical summary in ${languageLabelFor(normalizedLanguage)} for a vitals kiosk handoff. Keep it to 3 sentences maximum.`,
      userPrompt: `Vitals: ${currentVitalsSummary}\nPatient: ${patientInfo}\nRisk label: ${riskLabel}\nSummarize concerns and next steps.`,
      temperature: 0.1,
      maxTokens: 160
    });

    return response || `Triage: ${riskLabel}. ${currentVitalsSummary}`;
  }

  async runHealthCheck({ live = false } = {}) {
    const base = {
      status: 'ok',
      live,
      configured: Boolean(this.gateway.client && this.medicalService.client),
      models: {
        assistant: this.gateway.assistantModel,
        medical: this.medicalService.model,
        stt: this.gateway.transcriptionModel,
        tts: this.gateway.ttsModel,
        wakeWord: ASSISTANT_MODELS.wakeWord
      },
      supportedLanguages: SUPPORTED_LANGUAGES.map((entry) => entry.code)
    };

    if (!live) {
      return base;
    }

    if (!this.gateway.client || !this.medicalService.client) {
      return {
        ...base,
        status: 'degraded',
        error: 'OpenAI client is not configured for live health checks.'
      };
    }

    const result = {
      ...base,
      checks: {
        assistant: { ok: false },
        medical: { ok: false },
        tts: { ok: false },
        transcribe: { ok: false }
      }
    };

    try {
      const assistantReply = await this.gateway.generateAssistantReply({
        message: 'Reply with the exact phrase: assistant health ok.',
        conversationHistory: [],
        language: 'en'
      });
      result.checks.assistant = { ok: Boolean(assistantReply), sample: assistantReply };
    } catch (error) {
      result.checks.assistant = { ok: false, error: error.message };
    }

    try {
      const medicalReply = await this.medicalService.provideGuidance({
        message: 'Is a mild headache after poor sleep always an emergency? Reply in one short sentence.',
        language: 'English'
      });
      result.checks.medical = { ok: Boolean(medicalReply), sample: medicalReply };
    } catch (error) {
      result.checks.medical = { ok: false, error: error.message };
    }

    let audioBuffer = null;
    try {
      audioBuffer = await this.gateway.synthesizeSpeech('assistant health check successful', {
        voice: process.env.OPENAI_TTS_VOICE || 'alloy',
        format: 'mp3',
        language: 'en'
      });
      result.checks.tts = { ok: Boolean(audioBuffer?.length), bytes: audioBuffer?.length || 0 };
    } catch (error) {
      result.checks.tts = { ok: false, error: error.message };
    }

    try {
      const transcription = audioBuffer
        ? await this.gateway.transcribeAudio(audioBuffer, 'assistant-health-check.mp3', 'en')
        : null;
      result.checks.transcribe = {
        ok: Boolean(transcription?.text),
        text: transcription?.text || '',
        language: transcription?.language || 'en'
      };
    } catch (error) {
      result.checks.transcribe = { ok: false, error: error.message };
    }

    if (Object.values(result.checks).some((entry) => !entry.ok)) {
      result.status = 'degraded';
    }

    return result;
  }
}

module.exports = UnifiedAssistantService;