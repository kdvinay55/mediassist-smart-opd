const express = require('express');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Vitals = require('../models/Vitals');
const Consultation = require('../models/Consultation');
const LabResult = require('../models/LabResult');
const Medication = require('../models/Medication');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/patients/profile
router.get('/profile', auth, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient profile not found' });
    }
    res.json(patient);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/patients/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, ...patientData } = req.body;

    // Update user name if provided
    if (name && name.trim()) {
      await User.findByIdAndUpdate(req.user._id, { name: name.trim() });
    }

    const patient = await Patient.findOneAndUpdate(
      { userId: req.user._id },
      { ...patientData, userId: req.user._id },
      { new: true, upsert: true }
    );

    // Return updated user info along with patient data
    const updatedUser = await User.findById(req.user._id).select('-password -otp -otpExpiry');
    res.json({ patient, user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/patients/onboarding
router.post('/onboarding', auth, async (req, res) => {
  try {
    const { dateOfBirth, gender, bloodGroup, address, emergencyContact, allergies, chronicConditions, currentMedications, medicalHistory } = req.body;

    await Patient.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        dateOfBirth,
        gender,
        bloodGroup,
        address,
        emergencyContact,
        allergies: allergies?.filter(Boolean) || [],
        chronicConditions: chronicConditions?.filter(Boolean) || [],
        currentMedications: currentMedications?.filter(Boolean) || [],
        medicalHistory: medicalHistory?.filter(h => h.condition) || []
      },
      { new: true, upsert: true }
    );

    // Mark onboarding complete on user
    const user = await User.findByIdAndUpdate(req.user._id, { onboardingComplete: true }, { returnDocument: 'after' });

    res.json({
      message: 'Onboarding complete',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        onboardingComplete: true
      }
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Failed to save onboarding data' });
  }
});

// GET /api/patients/dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [upcomingAppointments, recentVitals, activeMedications, pendingLabs, recentConsultations, patientProfile] = await Promise.all([
      Appointment.find({ patientId: userId, date: { $gte: today }, status: { $nin: ['completed', 'cancelled'] } })
        .populate('doctorId', 'name specialization')
        .sort({ date: 1 }).limit(5),
      Vitals.find({ patientId: userId }).sort({ createdAt: -1 }).limit(1),
      Medication.find({ patientId: userId, isActive: true }),
      LabResult.find({ patientId: userId, status: { $in: ['ordered', 'processing'] } }),
      Consultation.find({ patientId: userId }).sort({ createdAt: -1 }).limit(3)
        .populate('doctorId', 'name specialization'),
      Patient.findOne({ userId })
    ]);

    res.json({
      upcomingAppointments,
      latestVitals: recentVitals[0] || null,
      activeMedications,
      pendingLabs,
      recentConsultations,
      emergencyContact: patientProfile?.emergencyContact || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// GET /api/patients/history
router.get('/history', auth, async (req, res) => {
  try {
    const consultations = await Consultation.find({ patientId: req.user._id })
      .populate('doctorId', 'name specialization')
      .populate('appointmentId')
      .sort({ createdAt: -1 });
    res.json(consultations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// GET /api/patients/:id (doctor/admin access)
router.get('/:id', auth, authorize('doctor', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -otp -otpExpiry');
    const patient = await Patient.findOne({ userId: req.params.id });
    const vitals = await Vitals.find({ patientId: req.params.id }).sort({ createdAt: -1 }).limit(5);
    const appointments = await Appointment.find({ patientId: req.params.id }).sort({ date: -1 }).limit(10);

    res.json({ user, patient, recentVitals: vitals, appointments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get patient data' });
  }
});

module.exports = router;
