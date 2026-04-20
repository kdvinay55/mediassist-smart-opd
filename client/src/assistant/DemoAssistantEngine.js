function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

const DEMO_FIXTURES = Object.freeze({
  appointments: [
    'General Medicine tomorrow at 10:00 AM with Dr. Vikram Sharma',
    'Cardiology follow-up on Friday at 02:30 PM with Dr. Neha Patel'
  ],
  queue: {
    number: 'A12',
    waitTime: '15 minutes'
  },
  labSummary: 'CBC sample collected and marked in processing. Preliminary fever workup does not show any critical abnormality in the demo dataset.',
  medications: ['Paracetamol 650 mg', 'Salbutamol inhaler', 'Metformin 500 mg'],
  room: 'Consultation Room 3 on the first floor near the triage desk',
  notifications: ['Lab sample status updated', 'Medication reminder due at 8 PM'],
  wellness: 'Hydrate well, walk 30 minutes daily, keep a regular sleep schedule, and review blood pressure and glucose once a week.'
});

function buildResponse(text) {
  if (includesAny(text, ['appointment', 'appointments'])) {
    return {
      type: 'command',
      intent: 'SHOW_APPOINTMENTS',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/appointments',
      response: `Demo mode: You have ${DEMO_FIXTURES.appointments.length} appointments. ${DEMO_FIXTURES.appointments.join('. ')}.`
    };
  }

  if (includesAny(text, ['queue', 'wait time', 'waiting time', 'how long'])) {
    return {
      type: 'command',
      intent: 'GET_QUEUE',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/queue',
      response: `Demo mode: Your queue number is ${DEMO_FIXTURES.queue.number} and the estimated wait is ${DEMO_FIXTURES.queue.waitTime}.`
    };
  }

  if (includesAny(text, ['lab', 'test result', 'lab result'])) {
    return {
      type: 'command',
      intent: 'SHOW_LAB_RESULTS',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/lab-results',
      response: `Demo mode: ${DEMO_FIXTURES.labSummary}`
    };
  }

  if (includesAny(text, ['medication', 'medicine', 'tablet', 'pill'])) {
    return {
      type: 'command',
      intent: 'SHOW_MEDICATIONS',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/medications',
      response: `Demo mode: Your active medications are ${DEMO_FIXTURES.medications.join(', ')}.`
    };
  }

  if (includesAny(text, ['room', 'consultation room', 'where'])) {
    return {
      type: 'command',
      intent: 'GET_ROOM',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/consultations',
      response: `Demo mode: Your doctor is in ${DEMO_FIXTURES.room}.`
    };
  }

  if (includesAny(text, ['notification', 'notifications'])) {
    return {
      type: 'command',
      intent: 'SHOW_NOTIFICATIONS',
      confidence: 1,
      action: 'NAVIGATE',
      navigateTo: '/notifications',
      response: `Demo mode: Recent notifications are ${DEMO_FIXTURES.notifications.join(' and ')}.`
    };
  }

  if (includesAny(text, ['wellness', 'diet', 'exercise', 'health plan'])) {
    return {
      type: 'chat',
      intent: 'GENERAL_CHAT',
      confidence: 0.8,
      response: `Demo mode: ${DEMO_FIXTURES.wellness}`
    };
  }

  if (includesAny(text, ['book', 'schedule']) && includesAny(text, ['appointment'])) {
    return {
      type: 'command',
      intent: 'BOOK_APPOINTMENT',
      confidence: 0.95,
      action: 'NAVIGATE',
      navigateTo: '/appointments',
      response: 'Demo mode: I have prepared a mock appointment for tomorrow at 10:00 AM in General Medicine.'
    };
  }

  return {
    type: 'chat',
    intent: 'GENERAL_CHAT',
    confidence: 0.65,
    response: 'Demo mode: The live AI service is unavailable, but I can still guide you through appointments, queue status, lab results, medications, rooms, and notifications using local fallback data.'
  };
}

export default function buildDemoAssistantResponse(text, { language = 'en', reason = 'demo_mode' } = {}) {
  const normalizedText = normalizeText(text);
  const response = buildResponse(normalizedText);
  return {
    ...response,
    language,
    success: true,
    demoMode: true,
    reason,
    source: 'client-demo-fallback'
  };
}