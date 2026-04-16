const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Vitals = require('../models/Vitals');
const WorkflowState = require('../models/WorkflowState');
const Consultation = require('../models/Consultation');
const LabResult = require('../models/LabResult');

const router = express.Router();

const PWD_PATIENT = 'patient123';
const PWD_DOCTOR = 'doctor123';
const PWD_ADMIN = 'reception123';
const PWD_LAB = 'lab12345';

const STAFF_RECEPTIONIST = {
  name: 'Anita Mehra',
  email: 'reception@smartopd.com',
  phone: '+919000000001',
  role: 'admin',
  department: 'reception',
};

const STAFF_LAB = {
  name: 'Rajesh Nair',
  email: 'lab@smartopd.com',
  phone: '+919000000010',
  role: 'admin',
  department: 'laboratory',
};

const STAFF_DOCTORS = [
  { name: 'Dr. Vikram Sharma', email: 'dr.sharma@smartopd.com', phone: '+918000000001', department: 'General Medicine', specialization: 'General Medicine', licenseNumber: 'MCI-12345' },
  { name: 'Dr. Neha Patel', email: 'dr.patel@smartopd.com', phone: '+918000000002', department: 'Cardiology', specialization: 'Cardiology', licenseNumber: 'MCI-12346' },
  { name: 'Dr. Suresh Reddy', email: 'dr.reddy@smartopd.com', phone: '+918000000003', department: 'Orthopedics', specialization: 'Orthopedics', licenseNumber: 'MCI-12347' },
];

const STAFF_PATIENTS = [
  {
    user: { name: 'Rahul Kumar', email: 'rahul@patient.com', phone: '+919100000001' },
    profile: { dateOfBirth: new Date('1990-05-15'), gender: 'male', bloodGroup: 'B+', allergies: ['Penicillin'], chronicConditions: ['Asthma'], currentMedications: ['Salbutamol Inhaler'], emergencyContact: { name: 'Sunita Kumar', phone: '+919100000099', relation: 'Mother' }, medicalHistory: [{ condition: 'Asthma', diagnosedDate: new Date('2010-03-01'), status: 'ongoing', notes: 'Mild persistent, uses inhaler as needed' }] }
  },
  {
    user: { name: 'Priya Singh', email: 'priya@patient.com', phone: '+919100000002' },
    profile: { dateOfBirth: new Date('1985-11-20'), gender: 'female', bloodGroup: 'O+', allergies: [], chronicConditions: ['Diabetes Type 2'], currentMedications: ['Metformin 500mg'], emergencyContact: { name: 'Raj Singh', phone: '+919100000098', relation: 'Spouse' }, medicalHistory: [{ condition: 'Type 2 Diabetes', diagnosedDate: new Date('2018-06-15'), status: 'ongoing', notes: 'Controlled with medication, HbA1c 6.8%' }] }
  },
  {
    user: { name: 'Amit Verma', email: 'amit@patient.com', phone: '+919100000003' },
    profile: { dateOfBirth: new Date('1978-03-08'), gender: 'male', bloodGroup: 'A+', allergies: ['Sulfa drugs'], chronicConditions: [], currentMedications: [], emergencyContact: { name: 'Meera Verma', phone: '+919100000097', relation: 'Spouse' }, medicalHistory: [{ condition: 'ACL tear (sports injury)', diagnosedDate: new Date('2020-01-10'), status: 'resolved', notes: 'Surgical repair done, fully recovered' }] }
  },
];

// Helper to create a user if not exists
async function ensureUser(data, password) {
  let user = await User.findOne({ email: data.email });
  if (!user) {
    user = await User.create({
      ...data,
      password: await bcrypt.hash(password, 12),
      isVerified: true,
      onboardingComplete: true,
    });
    return { user, status: 'created' };
  }
  return { user, status: 'exists' };
}

// POST /api/demo/seed
router.post('/seed', async (req, res) => {
  try {
    const log = { staff: [], doctors: [], patients: [], appointments: [], vitals: [], consultations: [], labOrders: [] };

    // --- Receptionist ---
    const { user: receptionist, status: recStatus } = await ensureUser(STAFF_RECEPTIONIST, PWD_ADMIN);
    if (recStatus === 'exists' && receptionist.department !== 'reception') {
      receptionist.department = 'reception';
      await receptionist.save();
    }
    log.staff.push({ name: STAFF_RECEPTIONIST.name, role: 'Receptionist', status: recStatus });

    // --- Lab Technician ---
    const { user: labTech, status: labStatus } = await ensureUser(STAFF_LAB, PWD_LAB);
    if (labStatus === 'exists' && labTech.department !== 'laboratory') {
      labTech.department = 'laboratory';
      await labTech.save();
    }
    log.staff.push({ name: STAFF_LAB.name, role: 'Lab Technician', status: labStatus });

    // --- Doctors ---
    const doctorUsers = [];
    for (const doc of STAFF_DOCTORS) {
      let { user, status } = await ensureUser({ ...doc, role: 'doctor' }, PWD_DOCTOR);
      if (status === 'exists') {
        user.department = doc.department;
        user.specialization = doc.specialization;
        user.isVerified = true;
        await user.save();
      }
      doctorUsers.push(user);
      log.doctors.push({ name: doc.name, department: doc.department, status });
    }

    // --- Patients ---
    const patientUsers = [];
    for (const pat of STAFF_PATIENTS) {
      const { user, status } = await ensureUser({ ...pat.user, role: 'patient' }, PWD_PATIENT);
      await Patient.findOneAndUpdate(
        { userId: user._id },
        { userId: user._id, ...pat.profile },
        { upsert: true, returnDocument: 'after' }
      );
      patientUsers.push(user);
      log.patients.push({ name: pat.user.name, status });
    }

    // --- Appointments for today ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const symptoms = [
      ['Fever', 'Cough', 'Body Pain'],
      ['Chest Pain', 'Shortness of Breath'],
      ['Knee Pain', 'Swelling'],
    ];
    const reasons = [
      'Persistent fever and cough for 3 days',
      'Occasional chest discomfort during exertion',
      'Knee pain after morning walks',
    ];

    const appointments = [];
    for (let i = 0; i < patientUsers.length; i++) {
      let apt = await Appointment.findOne({
        patientId: patientUsers[i]._id,
        date: { $gte: today, $lte: todayEnd }
      });

      if (!apt) {
        apt = await Appointment.create({
          patientId: patientUsers[i]._id,
          date: new Date(),
          timeSlot: `${9 + i}:00`,
          department: STAFF_DOCTORS[i].department,
          type: 'new',
          status: 'scheduled',
          priority: i === 0 ? 'urgent' : 'normal',
          symptoms: symptoms[i],
          reasonForVisit: reasons[i],
        });
        log.appointments.push({ patient: STAFF_PATIENTS[i].user.name, department: STAFF_DOCTORS[i].department, status: 'created' });
      } else {
        log.appointments.push({ patient: STAFF_PATIENTS[i].user.name, status: 'exists' });
      }
      appointments.push(apt);
    }

    // --- Auto-verify & assign first patient (Rahul → Dr. Sharma) so the flow is partially advanced ---
    if (appointments[0] && appointments[0].status === 'scheduled') {
      appointments[0].status = 'checked-in';
      appointments[0].doctorId = doctorUsers[0]._id;
      await appointments[0].save();

      // Create workflow state
      await WorkflowState.findOneAndUpdate(
        { appointmentId: appointments[0]._id },
        { appointmentId: appointments[0]._id, patientId: patientUsers[0]._id, currentState: 'QUEUED', stateHistory: [{ state: 'REGISTERED', timestamp: new Date(Date.now() - 3600000) }, { state: 'QUEUED', timestamp: new Date() }] },
        { upsert: true, returnDocument: 'after' }
      );

      // Add vitals for Rahul
      await Vitals.findOneAndUpdate(
        { appointmentId: appointments[0]._id },
        {
          patientId: patientUsers[0]._id,
          appointmentId: appointments[0]._id,
          bloodPressure: { systolic: 130, diastolic: 85 },
          heartRate: 92,
          temperature: 101.2,
          oxygenSaturation: 97,
          weight: 72,
          height: 175,
          recordedBy: receptionist._id,
        },
        { upsert: true, returnDocument: 'after' }
      );
      log.vitals.push({ patient: 'Rahul Kumar', status: 'recorded' });

      // Create a consultation record
      const consultation = await Consultation.findOneAndUpdate(
        { appointmentId: appointments[0]._id },
        {
          appointmentId: appointments[0]._id,
          patientId: patientUsers[0]._id,
          doctorId: doctorUsers[0]._id,
          status: 'in-progress',
          symptoms: symptoms[0],
          notes: '',
        },
        { upsert: true, returnDocument: 'after' }
      );
      log.consultations.push({ patient: 'Rahul Kumar', doctor: 'Dr. Vikram Sharma', status: 'in-progress' });

      // Order a lab test (CBC for fever workup)
      await LabResult.findOneAndUpdate(
        { appointmentId: appointments[0]._id, testName: 'Complete Blood Count (CBC)' },
        {
          patientId: patientUsers[0]._id,
          appointmentId: appointments[0]._id,
          consultationId: consultation._id,
          orderedBy: doctorUsers[0]._id,
          testName: 'Complete Blood Count (CBC)',
          testCategory: 'blood',
          priority: 'urgent',
          status: 'ordered',
        },
        { upsert: true, returnDocument: 'after' }
      );
      log.labOrders.push({ patient: 'Rahul Kumar', test: 'CBC', status: 'ordered' });
    }

    res.json({ success: true, log });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Seed failed', details: error.message });
  }
});

module.exports = router;
