const Appointment = require('../../models/Appointment');
const LabResult = require('../../models/LabResult');
const Medication = require('../../models/Medication');
const Notification = require('../../models/Notification');
const WorkflowState = require('../../models/WorkflowState');
const { generateQrToken } = require('../qr');
const { ASSISTANT_MODELS } = require('./config');

const BOOKABLE_SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM'];

function formatDateForSpeech(dateInput) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function extractBookingEntities(text) {
  const lower = text.toLowerCase();
  const entities = {};
  const now = new Date();

  if (lower.includes('tomorrow')) {
    entities.date = new Date(now.getTime() + 86400000).toISOString();
  } else if (lower.includes('today')) {
    entities.date = now.toISOString();
  } else if (lower.includes('day after tomorrow')) {
    entities.date = new Date(now.getTime() + 2 * 86400000).toISOString();
  } else {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const dayMatch = lower.match(/(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december))?/i);
    const monthFirst = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);

    if (dayMatch) {
      const day = parseInt(dayMatch[1], 10);
      const monthStr = dayMatch[2];
      const month = monthStr ? monthNames.indexOf(monthStr.toLowerCase()) : now.getMonth();
      const candidate = new Date(now.getFullYear(), month, day);
      if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
      entities.date = candidate.toISOString();
    } else if (monthFirst) {
      const month = monthNames.indexOf(monthFirst[1].toLowerCase());
      const day = parseInt(monthFirst[2], 10);
      const candidate = new Date(now.getFullYear(), month, day);
      if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
      entities.date = candidate.toISOString();
    }
  }

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
    [/\bsurgery\b/, 'Surgery']
  ];
  for (const [pattern, department] of deptMap) {
    if (pattern.test(lower)) {
      entities.department = department;
      break;
    }
  }

  return entities;
}

function ruleBasedIntent(text) {
  const lower = text.toLowerCase();
  const hasAppointment = /\bappointment\b/.test(lower);
  const hasBookVerb = /\b(book|schedule|make|fix|set up|need|want|get)\b/.test(lower);
  const hasDateHint = /\b(tomorrow|today|day after|on\s+\d|next week|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th))\b/.test(lower);
  const hasDeptHint = /\b(ent|cardio|cardiology|ortho|derma|skin|eye|dental|neuro|pediatric|gynec|general medicine|generic|surgery)\b/.test(lower);
  const hasSymptomsHint = /\b(body pain|headache|fever|cold|cough|pain|regarding|symptoms?)\b/.test(lower);

  if (hasAppointment && (hasBookVerb || hasDateHint || hasDeptHint || hasSymptomsHint)) {
    return { intent: 'BOOK_APPOINTMENT', entities: extractBookingEntities(text), confidence: 0.95 };
  }

  if (/\b(cancel|remove|delete)\b.*\bappointment\b/.test(lower) || /\bappointment\b.*\b(cancel|remove|delete)\b/.test(lower)) {
    return { intent: 'CANCEL_APPOINTMENT', entities: {}, confidence: 0.95 };
  }

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

  const pageMap = [
    { keys: ['dashboard'], page: 'dashboard', path: '/dashboard' },
    { keys: ['appointments'], page: 'appointments', path: '/appointments' },
    { keys: ['lab results', 'lab result', 'test results'], page: 'lab results', path: '/lab-results' },
    { keys: ['medications', 'medicine list', 'prescriptions'], page: 'medications', path: '/medications' },
    { keys: ['queue', 'my queue'], page: 'queue', path: '/queue' },
    { keys: ['opd traffic', 'traffic'], page: 'opd traffic', path: '/opd-traffic' },
    { keys: ['profile', 'my profile', 'account'], page: 'profile', path: '/profile' },
    { keys: ['feedback', 'review'], page: 'feedback', path: '/feedback' },
    { keys: ['symptom checker', 'symptom check', 'check symptoms', 'check my symptoms'], page: 'symptom checker', path: '/symptom-checker' }
  ];
  const navMatch = pageMap.find((entry) => entry.keys.some((key) => lower.includes(key)));
  if (navMatch) {
    return { intent: 'NAVIGATE', entities: { page: navMatch.page, path: navMatch.path }, confidence: 0.95 };
  }

  return { intent: 'GENERAL_CHAT', entities: {}, confidence: 0.5 };
}

async function pickAvailableSlot(date, department, requested) {
  const startOfDay = new Date(date);
  const endOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  endOfDay.setHours(23, 59, 59, 999);

  const booked = await Appointment.find({
    department,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $nin: ['cancelled', 'no-show'] }
  }).select('timeSlot').lean();

  const taken = new Set(booked.map((entry) => entry.timeSlot));
  if (requested && !taken.has(requested)) return requested;
  return BOOKABLE_SLOTS.find((slot) => !taken.has(slot)) || null;
}

class IntentService {
  constructor({ logger } = {}) {
    this.logger = logger;
    this.model = ASSISTANT_MODELS.assistantLogic;
    this.handlers = {
      BOOK_APPOINTMENT: this.bookAppointment.bind(this),
      CANCEL_APPOINTMENT: this.cancelAppointment.bind(this),
      SHOW_APPOINTMENTS: this.showAppointments.bind(this),
      SHOW_LAB_RESULTS: this.showLabResults.bind(this),
      SET_REMINDER: this.setReminder.bind(this),
      SHOW_MEDICATIONS: this.showMedications.bind(this),
      ENTER_VITALS: this.enterVitals.bind(this),
      GET_QUEUE: this.getQueue.bind(this),
      GET_WAIT_TIME: this.getWaitTime.bind(this),
      GET_ROOM: this.getRoom.bind(this),
      SHOW_NOTIFICATIONS: this.showNotifications.bind(this),
      NAVIGATE: this.navigate.bind(this),
      GENERAL_CHAT: this.generalChat.bind(this)
    };
  }

  async detectIntent(text) {
    const input = String(text || '').trim();
    this.logger?.('intent_detect_requested', { model: this.model, chars: input.length });
    return ruleBasedIntent(input);
  }

  async execute(intent, entities = {}, context = {}) {
    const handler = this.handlers[intent];
    if (!handler) {
      throw new Error(`Unhandled intent: ${intent}`);
    }
    return handler(entities, context);
  }

  async bookAppointment(entities, { userId }) {
    const date = entities.date ? new Date(entities.date) : new Date(Date.now() + 86400000);
    if (Number.isNaN(date.getTime())) date.setTime(Date.now() + 86400000);
    const department = entities.department || 'General Medicine';
    const timeSlot = await pickAvailableSlot(date, department, entities.timeSlot);
    if (!timeSlot) {
      return { success: false, message: `Sorry, ${department} is fully booked on ${formatDateForSpeech(date)}. Please pick another date or department.` };
    }

    const appointment = await Appointment.create({
      patientId: userId,
      date,
      department,
      timeSlot,
      type: 'new',
      status: 'scheduled',
      priority: 'normal',
      symptoms: [],
      qrToken: generateQrToken()
    });

    return {
      success: true,
      message: `Appointment booked for ${formatDateForSpeech(date)} at ${timeSlot} in ${department} department. Your appointment ID is ${appointment._id.toString().slice(-6).toUpperCase()}.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments',
      data: appointment
    };
  }

  async cancelAppointment(entities, { userId }) {
    const appointments = await Appointment.find({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).sort({ date: 1 });
    if (appointments.length === 0) {
      return { success: false, message: 'You have no active appointments to cancel.' };
    }

    const target = entities.appointmentId
      ? appointments.find((appointment) => appointment._id.toString().includes(entities.appointmentId))
      : appointments[0];

    if (!target) {
      return { success: false, message: 'Could not find the appointment to cancel.' };
    }

    target.status = 'cancelled';
    await target.save();
    return {
      success: true,
      message: `Appointment on ${formatDateForSpeech(target.date)} has been cancelled.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async showAppointments(_entities, { userId }) {
    const appointments = await Appointment.find({ patientId: userId }).sort({ date: -1 }).limit(5).lean();
    if (appointments.length === 0) {
      return { success: true, message: 'You have no appointments scheduled.' };
    }

    if (appointments.length === 1) {
      const appointment = appointments[0];
      return {
        success: true,
        message: `You have one appointment in ${appointment.department || 'General'} on ${formatDateForSpeech(appointment.date)}, and it is ${appointment.status}.`,
        action: 'NAVIGATE',
        navigateTo: '/appointments'
      };
    }

    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
    const parts = appointments.map((appointment, index) => `Your ${ordinals[index] || `${index + 1}th`} appointment is ${appointment.department || 'General'} on ${formatDateForSpeech(appointment.date)}, status ${appointment.status}`);
    return {
      success: true,
      message: `You have ${appointments.length} recent appointments. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async showLabResults(entities, { userId }) {
    const query = { patientId: userId };
    if (entities.testName) {
      const escaped = entities.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.testName = new RegExp(escaped, 'i');
    }

    const labs = await LabResult.find(query).sort({ createdAt: -1 }).limit(5).lean();
    if (labs.length === 0) {
      return { success: true, message: 'No lab results found.' };
    }

    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
    const parts = labs.map((lab, index) => `Your ${ordinals[index] || `${index + 1}th`} result is ${lab.testName}, which is ${lab.status}`);
    return {
      success: true,
      message: `You have ${labs.length} lab results. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/lab-results'
    };
  }

  async setReminder(entities) {
    return {
      success: true,
      message: `I'll set a reminder for ${entities.medication || 'your medication'}${entities.time ? ` at ${entities.time}` : ''}. You can manage reminders in the Medication Reminders section.`,
      action: 'NAVIGATE',
      navigateTo: '/medication-reminders'
    };
  }

  async showMedications(_entities, { userId }) {
    const medications = await Medication.find({ patientId: userId, isActive: true }).lean();
    if (medications.length === 0) {
      return { success: true, message: 'You have no active medications.' };
    }

    const parts = medications.map((medication) => `${medication.name} ${medication.dosage}, taken ${medication.frequency}`);
    return {
      success: true,
      message: `You have ${medications.length} active medication${medications.length > 1 ? 's' : ''}. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/medications'
    };
  }

  async enterVitals(entities) {
    const parts = [];
    if (entities.temperature) parts.push(`Temperature: ${entities.temperature} degrees Fahrenheit`);
    if (entities.bloodPressure) parts.push(`Blood pressure: ${entities.bloodPressure}`);
    if (entities.heartRate) parts.push(`Heart rate: ${entities.heartRate} beats per minute`);
    if (entities.oxygenSaturation) parts.push(`SpO2: ${entities.oxygenSaturation} percent`);

    return {
      success: true,
      message: parts.length > 0
        ? `Noted vitals: ${parts.join(', ')}. Please go to the vitals entry page to record them properly.`
        : 'Please navigate to your appointment to enter vitals.',
      action: 'NAVIGATE',
      navigateTo: '/appointments'
    };
  }

  async getQueue(_entities, { userId }) {
    const appointment = await Appointment.findOne({ patientId: userId, status: 'in-queue' }).lean();
    if (!appointment) {
      return { success: true, message: 'You are not currently in any queue.' };
    }

    const workflow = await WorkflowState.findOne({ appointmentId: appointment._id, isActive: true }).lean();
    return {
      success: true,
      message: workflow
        ? `Your queue position is ${workflow.queuePosition || 'N/A'}. Token number: ${workflow.tokenNumber || 'N/A'}. Estimated wait: ${workflow.estimatedWaitTime || 'N/A'} minutes.`
        : `You are in queue for ${appointment.department}. Position: ${appointment.queuePosition || 'N/A'}.`,
      action: 'NAVIGATE',
      navigateTo: '/queue'
    };
  }

  async getWaitTime(_entities, { userId }) {
    const appointment = await Appointment.findOne({ patientId: userId, status: { $in: ['scheduled', 'in-queue'] } }).lean();
    if (!appointment) {
      return { success: true, message: 'You have no upcoming appointments.' };
    }

    const wait = appointment.estimatedWaitTime || Math.floor(Math.random() * 30) + 5;
    return { success: true, message: `Estimated wait time is approximately ${wait} minutes for ${appointment.department}.` };
  }

  async getRoom(_entities, { userId }) {
    const workflow = await WorkflowState.findOne({ patientId: userId, isActive: true }).lean();
    if (!workflow || !workflow.roomNumber) {
      return { success: true, message: 'No consultation room assigned yet. Please wait for your turn.' };
    }

    return { success: true, message: `Your consultation is in Room ${workflow.roomNumber}.` };
  }

  async showNotifications(_entities, { userId }) {
    const notifications = await Notification.find({ userId, isRead: false }).sort({ createdAt: -1 }).limit(5).lean();
    if (notifications.length === 0) {
      return { success: true, message: 'You have no unread notifications.' };
    }

    const parts = notifications.map((notification) => `${notification.title}: ${notification.message}`);
    return {
      success: true,
      message: `You have ${notifications.length} unread notification${notifications.length > 1 ? 's' : ''}. ${parts.join('. ')}.`,
      action: 'NAVIGATE',
      navigateTo: '/notifications'
    };
  }

  async navigate(entities) {
    const pageMap = {
      dashboard: '/dashboard',
      appointments: '/appointments',
      consultations: '/consultations',
      'lab results': '/lab-results',
      labs: '/lab-results',
      medications: '/medications',
      queue: '/queue',
      traffic: '/opd-traffic',
      'opd traffic': '/opd-traffic',
      notifications: '/notifications',
      profile: '/profile',
      feedback: '/feedback',
      'symptom checker': '/symptom-checker',
      symptoms: '/symptom-checker',
      reminders: '/medication-reminders',
      'follow ups': '/follow-ups',
      'follow-ups': '/follow-ups',
      'health tracking': '/health-tracking',
      health: '/health-tracking',
      'sample tracking': '/sample-tracking',
      samples: '/sample-tracking'
    };
    const page = entities.page?.toLowerCase() || '';
    const path = entities.path || pageMap[page] || Object.entries(pageMap).find(([key]) => page.includes(key))?.[1];

    if (!path) {
      return { success: true, message: 'Which page would you like to go to?' };
    }

    return {
      success: true,
      message: `Navigating to ${page || 'that page'}.`,
      action: 'NAVIGATE',
      navigateTo: path
    };
  }

  async generalChat() {
    return null;
  }
}

module.exports = IntentService;
