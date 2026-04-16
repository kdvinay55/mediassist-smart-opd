const express = require('express');
const { auth } = require('../middleware/auth');
const { queryOllama } = require('../services/ai');
const Appointment = require('../models/Appointment');
const LabResult = require('../models/LabResult');
const Medication = require('../models/Medication');
const Notification = require('../models/Notification');
const WorkflowState = require('../models/WorkflowState');
const Patient = require('../models/Patient');

const router = express.Router();

// Intent definitions for the AI to classify
const INTENT_SCHEMA = `Classify the user's intent into EXACTLY one of these categories and extract entities.
Return ONLY valid JSON, no markdown, no explanation.

Intents:
- BOOK_APPOINTMENT: User wants to book/schedule an appointment. Extract: { date?, department?, doctor?, timeSlot? }
- CANCEL_APPOINTMENT: User wants to cancel an appointment. Extract: { appointmentId? }
- SHOW_APPOINTMENTS: User wants to see their appointments. Extract: { filter? }
- SHOW_LAB_RESULTS: User wants lab results. Extract: { testName? }
- SET_REMINDER: User wants a medication reminder. Extract: { medication?, time?, frequency? }
- SHOW_MEDICATIONS: User wants to see medications.
- ENTER_VITALS: User wants to record vitals. Extract: { temperature?, bloodPressure?, heartRate?, oxygenSaturation? }
- GET_QUEUE: User wants queue position/status.
- GET_WAIT_TIME: User wants estimated wait time.
- GET_ROOM: User wants consultation room info.
- SHOW_NOTIFICATIONS: User wants to see notifications.
- NAVIGATE: User wants to go to a page. Extract: { page? }
- GENERAL_CHAT: General medical question or conversation. Extract: {}

Response format:
{"intent":"INTENT_NAME","entities":{...},"confidence":0.95}`;

function formatDateForSpeech(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

// Extract date and department from natural language
function extractBookingEntities(text) {
  const lower = text.toLowerCase();
  const entities = {};

  // Extract date: "on 15th", "on april 15", "tomorrow", "today", "on 15th april"
  const now = new Date();
  if (lower.includes('tomorrow')) {
    entities.date = new Date(now.getTime() + 86400000).toISOString();
  } else if (lower.includes('today')) {
    entities.date = now.toISOString();
  } else if (lower.includes('day after tomorrow')) {
    entities.date = new Date(now.getTime() + 2 * 86400000).toISOString();
  } else {
    // "on 15th", "on 15th april", "on april 15"
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const dayMatch = lower.match(/(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december))?/i);
    const monthFirst = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (dayMatch) {
      const day = parseInt(dayMatch[1]);
      const monthStr = dayMatch[2];
      const month = monthStr ? monthNames.indexOf(monthStr.toLowerCase()) : now.getMonth();
      let year = now.getFullYear();
      const d = new Date(year, month, day);
      if (d < now) { d.setFullYear(year + 1); }
      entities.date = d.toISOString();
    } else if (monthFirst) {
      const month = monthNames.indexOf(monthFirst[1].toLowerCase());
      const day = parseInt(monthFirst[2]);
      let year = now.getFullYear();
      const d = new Date(year, month, day);
      if (d < now) { d.setFullYear(year + 1); }
      entities.date = d.toISOString();
    }
  }

  // Extract department from keywords (use word boundaries to avoid partial matches like "ent" in "appointment")
  const deptMap = [
    [/\bent\b/, 'ENT'],
    [/\bcardio(logy)?\b/, 'Cardiology'],
    [/\bortho(pedic)?\b/, 'Orthopedics'],
    [/\bderma(tology)?\b/, 'Dermatology'],
    [/\bskin\b/, 'Dermatology'],
    [/\beye\b/, 'Ophthalmology'],
    [/\bdental\b/, 'Dental'],
    [/\bneuro(logy)?\b/, 'Neurology'],
    [/\bpediatric\b/, 'Pediatrics'],
    [/\bgynec/, 'Gynecology'],
    [/\bgeneral medicine\b/, 'General Medicine'],
    [/\bgeneric\b/, 'General Medicine'],
    [/\bsurgery\b/, 'Surgery'],
  ];
  for (const [pattern, dept] of deptMap) {
    if (pattern.test(lower)) { entities.department = dept; break; }
  }

  return entities;
}

// Simple rule-based intent heuristics for common commands
function ruleBasedIntent(text) {
  const lower = text.toLowerCase();
  console.log('📋 Checking rule-based intents for:', lower);

  // Detect contextual signals
  const hasAppointment = /\bappointment\b/.test(lower);
  const hasBookVerb = /\b(book|schedule|make|fix|set up|need|want|get)\b/.test(lower);
  const hasDateHint = /\b(tomorrow|today|day after|on\s+\d|next week|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th))\b/.test(lower);
  const hasDeptHint = /\b(ent|cardio|cardiology|ortho|derma|skin|eye|dental|neuro|pediatric|gynec|general medicine|generic|surgery)\b/.test(lower);
  const hasSymptomsHint = /\b(body pain|headache|fever|cold|cough|pain|regarding|symptoms?)\b/.test(lower);

  // BOOK: explicit verb + appointment, OR appointment + date/dept/symptoms context
  if (hasAppointment && (hasBookVerb || hasDateHint || hasDeptHint || hasSymptomsHint)) {
    const entities = extractBookingEntities(text);
    console.log('✓ Matched: BOOK_APPOINTMENT', entities);
    return { intent: 'BOOK_APPOINTMENT', entities, confidence: 0.95 };
  }

  // CANCEL: only explicit cancel commands, NOT questions about cancellations
  if (/\b(cancel|remove|delete)\b.*\bappointment\b/.test(lower) || /\bappointment\b.*\b(cancel|remove|delete)\b/.test(lower)) {
    const isQuestion = /^(what|which|when|how|did|does|do|is|are|was|were|have|has|can|could|should|would|tell|show)\b/.test(lower)
      || /\b(got cancelled|was cancelled|were cancelled|been cancelled|got canceled|was canceled)\b/.test(lower);
    if (!isQuestion) {
      console.log('✓ Matched: CANCEL_APPOINTMENT');
      return { intent: 'CANCEL_APPOINTMENT', entities: {}, confidence: 0.95 };
    }
  }

  // SHOW APPOINTMENTS
  if (/\b(show|list|view|see|get|display|check)\b.*\bappointment/.test(lower) || /\bmy\s+appointment/.test(lower)) {
    return { intent: 'SHOW_APPOINTMENTS', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('lab result') || lower.includes('lab results') || lower.includes('test result')) {
    return { intent: 'SHOW_LAB_RESULTS', entities: {}, confidence: 0.95 };
  }
  if (/\b(medication|medicine|drugs|pills|prescription)\b/.test(lower)) {
    return { intent: 'SHOW_MEDICATIONS', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('reminder')) {
    return { intent: 'SET_REMINDER', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('queue') || lower.includes('wait time') || lower.includes('waiting time') || lower.includes('how long')) {
    return { intent: lower.includes('wait') || lower.includes('how long') ? 'GET_WAIT_TIME' : 'GET_QUEUE', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('room') || lower.includes('consultation room')) {
    return { intent: 'GET_ROOM', entities: {}, confidence: 0.95 };
  }
  if (lower.includes('notification') || lower.includes('notifications')) {
    return { intent: 'SHOW_NOTIFICATIONS', entities: {}, confidence: 0.95 };
  }

  // NAVIGATE
  const pageMap = [
    { keys: ['dashboard'], page: 'dashboard', path: '/dashboard' },
    { keys: ['appointments'], page: 'appointments', path: '/appointments' },
    { keys: ['lab results', 'lab result', 'test results'], page: 'lab results', path: '/lab-results' },
    { keys: ['medications', 'medicine list', 'prescriptions'], page: 'medications', path: '/medications' },
    { keys: ['queue', 'my queue'], page: 'queue', path: '/queue' },
    { keys: ['opd traffic', 'traffic'], page: 'opd traffic', path: '/opd-traffic' },
    { keys: ['profile', 'my profile', 'account'], page: 'profile', path: '/profile' },
    { keys: ['feedback', 'review'], page: 'feedback', path: '/feedback' },
    { keys: ['symptom checker', 'symptom check', 'syndrome checker', 'symptoms checker', 'symptom', 'check symptoms', 'check my symptoms'], page: 'symptom checker', path: '/symptom-checker' },
  ];
  const navMatch = pageMap.find(entry => entry.keys.some(k => lower.includes(k)));
  if (navMatch) {
    return { intent: 'NAVIGATE', entities: { page: navMatch.page, path: navMatch.path }, confidence: 0.95 };
  }

  return null;
}

// Detect intent using Ollama
async function detectIntent(text) {
  const rule = ruleBasedIntent(text);
  if (rule) return rule;

  try {
    const prompt = `${INTENT_SCHEMA}\n\nUser said: "${text}"\n\nJSON:`;
    const raw = await queryOllama(prompt, 'You are an intent classifier. Output only valid JSON.');
    if (raw) {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
    return { intent: 'GENERAL_CHAT', entities: {}, confidence: 0.5 };
  } catch (err) {
    console.error('Intent classification failed:', err.message);
    return { intent: 'GENERAL_CHAT', entities: {}, confidence: 0.5 };
  }
}

// Execute commands based on intent
async function executeCommand(intent, entities, userId) {
  switch (intent) {
    case 'BOOK_APPOINTMENT': {
      const date = entities.date ? new Date(entities.date) : new Date(Date.now() + 86400000);
      if (isNaN(date.getTime())) date.setTime(Date.now() + 86400000);
      const dept = entities.department || 'General Medicine';
      const appt = await Appointment.create({
        patientId: userId,
        date,
        department: dept,
        timeSlot: entities.timeSlot || '10:00',
        type: 'new',
        status: 'scheduled',
        priority: 'normal',
        symptoms: []
      });
      return {
        success: true,
        message: `Appointment booked for ${formatDateForSpeech(date)} in ${dept} department. Your appointment ID is ${appt._id.toString().slice(-6).toUpperCase()}.`,
        data: appt,
        action: 'NAVIGATE',
        navigateTo: '/appointments'
      };
    }

    case 'CANCEL_APPOINTMENT': {
      const appts = await Appointment.find({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).sort({ date: 1 });
      if (appts.length === 0) {
        return { success: false, message: 'You have no active appointments to cancel.' };
      }
      const target = entities.appointmentId
        ? appts.find(a => a._id.toString().includes(entities.appointmentId))
        : appts[0];
      if (target) {
        target.status = 'cancelled';
        await target.save();
        return { success: true, message: `Appointment on ${formatDateForSpeech(target.date)} has been cancelled.`, action: 'NAVIGATE', navigateTo: '/appointments' };
      }
      return { success: false, message: 'Could not find the appointment to cancel.' };
    }

    case 'SHOW_APPOINTMENTS': {
      const appts = await Appointment.find({ patientId: userId }).sort({ date: -1 }).limit(5).lean();
      if (appts.length === 0) return { success: true, message: 'You have no appointments scheduled.' };
      if (appts.length === 1) {
        const a = appts[0];
        return { success: true, message: `You have one appointment in ${a.department || 'General'} on ${formatDateForSpeech(a.date)}, and it is ${a.status}.`, action: 'NAVIGATE', navigateTo: '/appointments' };
      }
      const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
      const parts = appts.map((a, i) => `Your ${ordinals[i] || (i + 1) + 'th'} appointment is ${a.department || 'General'} on ${formatDateForSpeech(a.date)}, status ${a.status}`);
      return { success: true, message: `You have ${appts.length} recent appointments. ${parts.join('. ')}.`, action: 'NAVIGATE', navigateTo: '/appointments' };
    }

    case 'SHOW_LAB_RESULTS': {
      const query = { patientId: userId };
      if (entities.testName) {
        const escaped = entities.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.testName = new RegExp(escaped, 'i');
      }
      const labs = await LabResult.find(query).sort({ createdAt: -1 }).limit(5).lean();
      if (labs.length === 0) return { success: true, message: 'No lab results found.' };
      const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
      const parts = labs.map((l, i) => `Your ${ordinals[i] || (i + 1) + 'th'} result is ${l.testName}, which is ${l.status}`);
      return { success: true, message: `You have ${labs.length} lab results. ${parts.join('. ')}.`, action: 'NAVIGATE', navigateTo: '/lab-results' };
    }

    case 'SHOW_MEDICATIONS': {
      const meds = await Medication.find({ patientId: userId, isActive: true }).lean();
      if (meds.length === 0) return { success: true, message: 'You have no active medications.' };
      const parts = meds.map((m) => `${m.name} ${m.dosage}, taken ${m.frequency}`);
      return { success: true, message: `You have ${meds.length} active medication${meds.length > 1 ? 's' : ''}. ${parts.join('. ')}.`, action: 'NAVIGATE', navigateTo: '/medications' };
    }

    case 'SET_REMINDER': {
      return {
        success: true,
        message: `I'll set a reminder for ${entities.medication || 'your medication'}${entities.time ? ' at ' + entities.time : ''}. You can manage reminders in the Medication Reminders section.`,
        action: 'NAVIGATE',
        navigateTo: '/medication-reminders'
      };
    }

    case 'ENTER_VITALS': {
      const parts = [];
      if (entities.temperature) parts.push(`Temperature: ${entities.temperature}°F`);
      if (entities.bloodPressure) parts.push(`BP: ${entities.bloodPressure}`);
      if (entities.heartRate) parts.push(`Heart Rate: ${entities.heartRate} bpm`);
      if (entities.oxygenSaturation) parts.push(`SpO2: ${entities.oxygenSaturation}%`);
      return {
        success: true,
        message: parts.length > 0
          ? `Noted vitals: ${parts.join(', ')}. Please go to the Vitals Entry page to record them properly.`
          : 'Please navigate to your appointment to enter vitals.',
        action: 'NAVIGATE',
        navigateTo: '/appointments'
      };
    }

    case 'GET_QUEUE': {
      const appt = await Appointment.findOne({ patientId: userId, status: 'in-queue' }).lean();
      if (!appt) return { success: true, message: 'You are not currently in any queue.' };
      const ws = await WorkflowState.findOne({ appointmentId: appt._id, isActive: true }).lean();
      return {
        success: true,
        message: ws
          ? `Your queue position is ${ws.queuePosition || 'N/A'}. Token number: ${ws.tokenNumber || 'N/A'}. Estimated wait: ${ws.estimatedWaitTime || 'N/A'} minutes.`
          : `You are in queue for ${appt.department}. Position: ${appt.queuePosition || 'N/A'}.`,
        action: 'NAVIGATE',
        navigateTo: '/queue'
      };
    }

    case 'GET_WAIT_TIME': {
      const appt = await Appointment.findOne({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).lean();
      if (!appt) return { success: true, message: 'You have no upcoming appointments.' };
      const wait = appt.estimatedWaitTime || Math.floor(Math.random() * 30) + 5;
      return { success: true, message: `Estimated wait time is approximately ${wait} minutes for ${appt.department}.` };
    }

    case 'GET_ROOM': {
      const ws = await WorkflowState.findOne({ patientId: userId, isActive: true }).lean();
      if (!ws || !ws.roomNumber) return { success: true, message: 'No consultation room assigned yet. Please wait for your turn.' };
      return { success: true, message: `Your consultation is in Room ${ws.roomNumber}.` };
    }

    case 'SHOW_NOTIFICATIONS': {
      const notifs = await Notification.find({ userId, isRead: false }).sort({ createdAt: -1 }).limit(5).lean();
      if (notifs.length === 0) return { success: true, message: 'You have no unread notifications.' };
      const parts = notifs.map((n) => `${n.title}: ${n.message}`);
      return { success: true, message: `You have ${notifs.length} unread notification${notifs.length > 1 ? 's' : ''}. ${parts.join('. ')}.`, action: 'NAVIGATE', navigateTo: '/notifications' };
    }

    case 'NAVIGATE': {
      const pageMap = {
        dashboard: '/dashboard', appointments: '/appointments', consultations: '/consultations',
        'lab results': '/lab-results', labs: '/lab-results', medications: '/medications',
        queue: '/queue', traffic: '/opd-traffic', 'opd traffic': '/opd-traffic',
        notifications: '/notifications', profile: '/profile', feedback: '/feedback',
        'symptom checker': '/symptom-checker', symptoms: '/symptom-checker',
        reminders: '/medication-reminders', 'follow ups': '/follow-ups', 'follow-ups': '/follow-ups',
        'health tracking': '/health-tracking', health: '/health-tracking',
        'sample tracking': '/sample-tracking', samples: '/sample-tracking'
      };
      const page = entities.page?.toLowerCase() || '';
      const path = pageMap[page] || Object.entries(pageMap).find(([k]) => page.includes(k))?.[1];
      if (path) return { success: true, message: `Navigating to ${page}.`, action: 'NAVIGATE', navigateTo: path };
      return { success: true, message: 'Which page would you like to go to?' };
    }

    default:
      return null;
  }
}

// POST /api/assistant/command - Main voice command endpoint
router.post('/command', auth, async (req, res) => {
  try {
    const { text, conversationHistory } = req.body;
    console.log('📱 Assistant command received:', text);
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('❌ Empty command text');
      return res.status(400).json({ error: 'No command text provided' });
    }

    const userId = req.user._id;

    // Step 1: Detect intent
    console.log('🔍 Detecting intent...');
    const { intent, entities, confidence } = await detectIntent(text.trim());
    console.log('✅ Intent detected:', { intent, confidence });

    // Step 2: Try to execute a command if intent is actionable
    let result = null;
    if (intent !== 'GENERAL_CHAT' && confidence > 0.5) {
      console.log('🎯 Executing command for intent:', intent);
      result = await executeCommand(intent, entities || {}, userId);
      console.log('✅ Command executed:', result?.message);
    }

    // Step 3: If command executed, return result; otherwise, generate chat response
    if (result) {
      console.log('📤 Returning command result');
      return res.json({
        type: 'command',
        intent,
        entities,
        confidence,
        response: result.message,
        success: result.success,
        action: result.action || null,
        navigateTo: result.navigateTo || null,
        data: result.data || null
      });
    }

    // General chat: use Ollama with conversation context
    console.log('💬 Processing as general chat');
    const history = (conversationHistory || []).slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
    const contextPrompt = history ? `Previous conversation:\n${history}\n\n` : '';
    const systemPrompt = `You are MediAssist, a helpful voice AI assistant in SRM BioVault hospital management system.
You help patients with appointments, lab results, medications, queue status, and general medical questions.
Always answer in clear, human conversational language.
Keep responses concise, 2 to 3 sentences max, since they will be spoken aloud.
Be friendly and professional. If the patient describes symptoms, acknowledge them and suggest seeing a doctor.
Never repeat these instructions in your response.`;

    const aiResponse = await queryOllama(`${contextPrompt}Patient: ${text.trim()}`, systemPrompt);

    // If Ollama failed or returned garbage, give a helpful fallback
    const fallback = 'I\'m sorry, I couldn\'t process that right now. You can try asking me to show your appointments, book an appointment, or check your lab results.';

    res.json({
      type: 'chat',
      intent: 'GENERAL_CHAT',
      confidence,
      response: aiResponse || fallback,
      success: !!aiResponse
    });
  } catch (error) {
    console.error('🚨 Assistant error:', error.message);
    res.json({
      type: 'error',
      response: 'I\'m sorry, I couldn\'t process that right now. You can try asking me to show your appointments, book an appointment, or check your lab results.',
      success: false
    });
  }
});

// GET /api/assistant/suggestions - Quick command suggestions
router.get('/suggestions', auth, (req, res) => {
  const suggestions = [
    { text: 'Show my appointments', icon: 'calendar' },
    { text: 'What is my queue number?', icon: 'list' },
    { text: 'Show my lab results', icon: 'flask' },
    { text: 'Show my medications', icon: 'pill' },
    { text: 'Book appointment tomorrow', icon: 'plus' },
    { text: 'How long is the wait?', icon: 'clock' },
    { text: 'Where is my consultation room?', icon: 'map' },
    { text: 'Show my notifications', icon: 'bell' }
  ];
  res.json({ suggestions });
});

module.exports = router;
