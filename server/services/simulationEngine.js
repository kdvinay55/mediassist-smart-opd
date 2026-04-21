const Appointment = require('../models/Appointment');
const LabResult = require('../models/LabResult');
const Notification = require('../models/Notification');
const WorkflowState = require('../models/WorkflowState');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Vitals = require('../models/Vitals');
const Consultation = require('../models/Consultation');
const Medication = require('../models/Medication');
const Feedback = require('../models/Feedback');
const bcrypt = require('bcryptjs');

let io = null;
let labTimers = {};

function initSimulation(socketIO) {
  io = socketIO;
  // Start lab status simulation loop
  setInterval(simulateLabProgress, 10000);
  // Start medication reminder check every 60s
  setInterval(checkMedicationReminders, 60000);
  console.log('Simulation engine initialized');
}

// --- Queue Simulation ---
async function assignQueue(appointmentId) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Count today's tokens for department
  const count = await Appointment.countDocuments({
    department: appointment.department,
    date: { $gte: today, $lte: todayEnd },
    tokenNumber: { $exists: true, $ne: null }
  });

  const tokenNumber = count + 1;
  const queuePosition = await Appointment.countDocuments({
    department: appointment.department,
    date: { $gte: today, $lte: todayEnd },
    status: { $in: ['checked-in', 'in-queue'] }
  }) + 1;

  const waitingTime = Math.floor(Math.random() * 41) + 5; // 5-45 min
  const roomNumber = Math.floor(Math.random() * 20) + 101; // 101-120

  appointment.tokenNumber = tokenNumber;
  appointment.queuePosition = queuePosition;
  appointment.estimatedWaitTime = waitingTime;
  appointment.status = 'in-queue';
  appointment.checkedInAt = new Date();
  await appointment.save();

  // Create/update workflow state
  let workflow = await WorkflowState.findOne({ appointmentId });
  if (!workflow) {
    workflow = await WorkflowState.create({
      patientId: appointment.patientId,
      appointmentId,
      currentState: 'QUEUED',
      tokenNumber,
      queuePosition,
      estimatedWaitTime: waitingTime,
      roomNumber,
      stateHistory: [
        { state: 'REGISTERED', enteredAt: appointment.createdAt },
        { state: 'QUEUED', enteredAt: new Date(), metadata: { tokenNumber, roomNumber, waitingTime } }
      ]
    });
  } else {
    workflow.currentState = 'QUEUED';
    workflow.tokenNumber = tokenNumber;
    workflow.queuePosition = queuePosition;
    workflow.estimatedWaitTime = waitingTime;
    workflow.roomNumber = roomNumber;
    workflow.stateHistory.push({ state: 'QUEUED', enteredAt: new Date(), metadata: { tokenNumber, roomNumber, waitingTime } });
    await workflow.save();
  }

  // Notify patient
  await createNotification(appointment.patientId, 'queue-update',
    'Queue Assigned',
    `Token #${tokenNumber} | Room ${roomNumber} | Est. wait: ${waitingTime} min`,
    appointmentId, 'Appointment');

  // Broadcast via socket
  if (io) {
    io.to(`dept-${appointment.department}`).emit('queue-update', {
      appointmentId, tokenNumber, queuePosition, waitingTime, roomNumber
    });
    io.to(`patient-${appointment.patientId}`).emit('queue-update', {
      appointmentId, tokenNumber, queuePosition, waitingTime, roomNumber
    });
  }

  return { tokenNumber, queuePosition, waitingTime, roomNumber };
}

// --- Workflow Transitions ---
const VALID_TRANSITIONS = {
  'REGISTERED': ['QUEUED'],
  'QUEUED': ['VITALS_RECORDED'],
  'VITALS_RECORDED': ['IN_CONSULTATION'],
  'IN_CONSULTATION': ['LAB_ORDERED', 'FOLLOWUP_SCHEDULED', 'COMPLETED'],
  'LAB_ORDERED': ['LAB_COMPLETED'],
  'LAB_COMPLETED': ['FOLLOWUP_SCHEDULED', 'COMPLETED'],
  'FOLLOWUP_SCHEDULED': ['COMPLETED']
};

async function transitionWorkflow(appointmentId, newState, metadata = {}) {
  const workflow = await WorkflowState.findOne({ appointmentId });
  if (!workflow) return { error: 'Workflow not found' };

  const allowed = VALID_TRANSITIONS[workflow.currentState];
  if (!allowed || !allowed.includes(newState)) {
    return { error: `Cannot transition from ${workflow.currentState} to ${newState}. Please complete the previous step first.` };
  }

  workflow.currentState = newState;
  workflow.stateHistory.push({ state: newState, enteredAt: new Date(), metadata });
  await workflow.save();

  // Broadcast
  if (io) {
    io.to(`patient-${workflow.patientId}`).emit('workflow-update', {
      appointmentId, currentState: newState, metadata
    });
  }

  return { success: true, currentState: newState };
}

// --- Lab Status Simulation (DISABLED - lab tech handles progression manually) ---
async function simulateLabProgress() {
  // Lab progression is now manual via lab tech dashboard
  // No automatic status changes
  return;
}

function generateSimulatedResults(testName, category) {
  const templates = {
    'Complete Blood Count': [
      { parameter: 'Hemoglobin', value: (12 + Math.random() * 4).toFixed(1), unit: 'g/dL', referenceRange: '12.0-17.5', flag: 'normal' },
      { parameter: 'WBC', value: (4000 + Math.random() * 7000).toFixed(0), unit: '/µL', referenceRange: '4000-11000', flag: 'normal' },
      { parameter: 'Platelets', value: (150000 + Math.random() * 250000).toFixed(0), unit: '/µL', referenceRange: '150000-400000', flag: 'normal' },
      { parameter: 'RBC', value: (4.0 + Math.random() * 2).toFixed(2), unit: 'M/µL', referenceRange: '4.0-6.0', flag: 'normal' }
    ],
    'Lipid Panel': [
      { parameter: 'Total Cholesterol', value: (150 + Math.random() * 100).toFixed(0), unit: 'mg/dL', referenceRange: '<200', flag: 'normal' },
      { parameter: 'LDL', value: (70 + Math.random() * 90).toFixed(0), unit: 'mg/dL', referenceRange: '<100', flag: 'normal' },
      { parameter: 'HDL', value: (35 + Math.random() * 40).toFixed(0), unit: 'mg/dL', referenceRange: '>40', flag: 'normal' },
      { parameter: 'Triglycerides', value: (80 + Math.random() * 120).toFixed(0), unit: 'mg/dL', referenceRange: '<150', flag: 'normal' }
    ]
  };

  if (templates[testName]) return templates[testName];

  // Generic results
  return [
    { parameter: testName + ' Level', value: (Math.random() * 100).toFixed(1), unit: 'units', referenceRange: '0-100', flag: 'normal' }
  ];
}

async function notifyLabStatus(lab, message) {
  await createNotification(lab.patientId, 'lab-ready', 'Lab Update', message, lab._id, 'LabResult');
  if (io) {
    io.to(`patient-${lab.patientId}`).emit('lab-update', { labId: lab._id, status: lab.status, testName: lab.testName });
    io.to('lab').emit('lab-update', { labId: lab._id, status: lab.status });
  }
}

// --- Medication Reminders ---
async function checkMedicationReminders() {
  try {
    const activeMeds = await Medication.find({ isActive: true, endDate: { $gte: new Date() } });
    for (const med of activeMeds) {
      // Check if reminder already sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existing = await Notification.findOne({
        userId: med.patientId,
        type: 'medication-reminder',
        relatedId: med._id,
        createdAt: { $gte: today }
      });
      if (!existing) {
        await createNotification(med.patientId, 'medication-reminder',
          'Medication Reminder',
          `Time to take ${med.name} (${med.dosage}) - ${med.frequency}`,
          med._id, 'Medication');
        if (io) {
          io.to(`patient-${med.patientId}`).emit('medication-reminder', { medicationId: med._id, name: med.name });
        }
      }
    }
  } catch (err) {
    console.error('Medication reminder error:', err.message);
  }
}

// --- Follow-up Scheduling ---
async function scheduleFollowUp(consultationId) {
  const consultation = await Consultation.findById(consultationId).populate('appointmentId');
  if (!consultation || !consultation.followUpDate) return null;

  const existing = await Appointment.findOne({
    patientId: consultation.patientId,
    type: 'follow-up',
    date: consultation.followUpDate
  });
  if (existing) return existing;

  const followUp = await Appointment.create({
    patientId: consultation.patientId,
    doctorId: consultation.doctorId,
    date: consultation.followUpDate,
    department: consultation.appointmentId?.department || 'General',
    type: 'follow-up',
    status: 'scheduled',
    reasonForVisit: 'Follow-up: ' + (consultation.finalDiagnosis?.[0] || consultation.chiefComplaint || 'Consultation'),
    symptoms: []
  });

  await createNotification(consultation.patientId, 'follow-up-reminder',
    'Follow-up Scheduled',
    `Follow-up appointment on ${consultation.followUpDate.toLocaleDateString()} has been auto-scheduled.`,
    followUp._id, 'Appointment');

  return followUp;
}

// --- Notification Helper ---
async function createNotification(userId, type, title, message, relatedId, relatedModel) {
  const notification = await Notification.create({ userId, type, title, message, relatedId, relatedModel });
  // Emit real-time push so the client bell + Notifications page update without polling
  if (io && userId) {
    try {
      io.to(`user-${userId}`).emit('notification', { notification });
    } catch (e) {
      console.warn('notification emit failed', e?.message);
    }
  }
  return notification;
}

// --- OPD Traffic ---
async function getOPDTraffic() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const departments = ['General Medicine', 'Cardiology', 'Orthopedics', 'Pediatrics', 'Dermatology', 'ENT', 'Ophthalmology', 'Neurology'];
  const traffic = [];

  for (const dept of departments) {
    const total = await Appointment.countDocuments({ department: dept, date: { $gte: today, $lte: todayEnd } });
    const waiting = await Appointment.countDocuments({ department: dept, date: { $gte: today, $lte: todayEnd }, status: { $in: ['checked-in', 'in-queue'] } });
    const completed = await Appointment.countDocuments({ department: dept, date: { $gte: today, $lte: todayEnd }, status: 'completed' });
    const avgWait = waiting > 0 ? Math.floor(Math.random() * 41) + 5 : 0;

    traffic.push({ department: dept, total, waiting, completed, avgWaitTime: avgWait });
  }

  return traffic;
}

// --- Demo Mode Seed ---
async function seedDemoData() {
  const existingDemo = await User.findOne({ email: 'demo.patient1@smartopd.com' });
  if (existingDemo) {
    console.log('Demo data already exists');
    return;
  }

  console.log('Seeding demo data...');
  const hash = await bcrypt.hash('demo123', 12);

  // Create demo users
  const patients = [];
  const doctors = [];

  for (let i = 1; i <= 10; i++) {
    const u = await User.create({
      name: `Demo Patient ${i}`, email: `demo.patient${i}@smartopd.com`,
      phone: `+91900000000${i}`, password: hash, role: 'patient', isVerified: true
    });
    const p = await Patient.create({
      userId: u._id, dateOfBirth: new Date(1980 + i, 0, 1),
      gender: i % 2 === 0 ? 'male' : 'female',
      bloodGroup: ['A+', 'B+', 'O+', 'AB+'][i % 4],
      allergies: i % 3 === 0 ? ['Penicillin'] : [],
      chronicConditions: i % 4 === 0 ? ['Diabetes'] : []
    });
    patients.push({ user: u, profile: p });
  }

  const demoDocDefs = [
    { name: 'Dr. Vikram Sharma', email: 'dr.sharma@smartopd.com', phone: '+918000000001', specialization: 'General Medicine', department: 'General Medicine' },
    { name: 'Dr. Neha Patel', email: 'dr.patel@smartopd.com', phone: '+918000000002', specialization: 'Cardiology', department: 'Cardiology' },
    { name: 'Dr. Suresh Reddy', email: 'dr.reddy@smartopd.com', phone: '+918000000003', specialization: 'Orthopedics', department: 'Orthopedics' },
    { name: 'Dr. Ananya Iyer', email: 'dr.iyer@smartopd.com', phone: '+918000000004', specialization: 'Pediatrics', department: 'Pediatrics' },
    { name: 'Dr. Pradeep Joshi', email: 'dr.joshi@smartopd.com', phone: '+918000000005', specialization: 'Dermatology', department: 'Dermatology' },
  ];
  const docHash = await bcrypt.hash('doctor123', 12);
  for (const def of demoDocDefs) {
    let d = await User.findOne({ email: def.email });
    if (!d) {
      d = await User.create({ ...def, password: docHash, role: 'doctor', isVerified: true });
    }
    doctors.push(d);
  }

  await User.create({
    name: 'Demo Admin', email: 'demo.admin@smartopd.com',
    phone: '+919000000099', password: hash, role: 'admin', isVerified: true
  });

  // Create appointments
  const today = new Date();
  const statuses = ['scheduled', 'in-queue', 'vitals-done', 'in-consultation', 'completed'];
  for (let i = 0; i < 20; i++) {
    const pat = patients[i % 10];
    const doc = doctors[i % 5];
    await Appointment.create({
      patientId: pat.user._id, doctorId: doc._id,
      tokenNumber: i + 1, date: today,
      timeSlot: `${9 + (i % 8)}:00`, department: doc.department,
      type: i % 5 === 0 ? 'follow-up' : 'new',
      status: statuses[i % 5], priority: i % 7 === 0 ? 'urgent' : 'normal',
      symptoms: ['Fever', 'Headache', 'Cough', 'Body Pain'].slice(0, (i % 3) + 1),
      queuePosition: i % 5 === 1 ? i + 1 : undefined,
      estimatedWaitTime: i % 5 === 1 ? Math.floor(Math.random() * 41) + 5 : undefined
    });
  }

  // Create lab results
  const labTests = ['Complete Blood Count', 'Lipid Panel', 'Blood Sugar', 'Thyroid Panel', 'Liver Function'];
  const labStatuses = ['ordered', 'sample-collected', 'processing', 'completed', 'completed'];
  for (let i = 0; i < 15; i++) {
    await LabResult.create({
      patientId: patients[i % 10].user._id,
      orderedBy: doctors[i % 5]._id,
      testName: labTests[i % 5], testCategory: 'blood',
      status: labStatuses[i % 5], priority: i % 4 === 0 ? 'urgent' : 'normal',
      results: labStatuses[i % 5] === 'completed' ? generateSimulatedResults(labTests[i % 5], 'blood') : [],
      completedAt: labStatuses[i % 5] === 'completed' ? new Date() : undefined
    });
  }

  // Create medications
  const meds = [
    { name: 'Paracetamol', dosage: '500mg', frequency: 'Twice daily' },
    { name: 'Amoxicillin', dosage: '250mg', frequency: 'Three times daily' },
    { name: 'Metformin', dosage: '500mg', frequency: 'Once daily' },
    { name: 'Atorvastatin', dosage: '10mg', frequency: 'Once daily at bedtime' },
    { name: 'Omeprazole', dosage: '20mg', frequency: 'Before breakfast' }
  ];
  for (let i = 0; i < 10; i++) {
    const med = meds[i % 5];
    await Medication.create({
      patientId: patients[i % 10].user._id,
      prescribedBy: doctors[i % 5]._id,
      name: med.name, dosage: med.dosage, frequency: med.frequency,
      duration: '7 days', route: 'oral',
      startDate: new Date(), endDate: new Date(Date.now() + 7 * 86400000),
      isActive: true
    });
  }

  console.log('Demo data seeded: 10 patients, 5 doctors, 1 admin, 20 appointments, 15 labs, 10 medications');
}

module.exports = {
  initSimulation,
  assignQueue,
  transitionWorkflow,
  scheduleFollowUp,
  createNotification,
  getOPDTraffic,
  seedDemoData,
  generateSimulatedResults,
  VALID_TRANSITIONS
};
