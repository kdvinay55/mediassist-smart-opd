const express = require('express');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Consultation = require('../models/Consultation');
const Feedback = require('../models/Feedback');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/stats
router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [totalPatients, totalDoctors, todayAppointments, completedToday, avgRating] = await Promise.all([
      User.countDocuments({ role: 'patient', isActive: true }),
      User.countDocuments({ role: 'doctor', isActive: true }),
      Appointment.countDocuments({ date: { $gte: today, $lte: endOfDay } }),
      Appointment.countDocuments({ date: { $gte: today, $lte: endOfDay }, status: 'completed' }),
      Feedback.aggregate([{ $group: { _id: null, avg: { $avg: '$overallRating' } } }])
    ]);

    res.json({
      totalPatients,
      totalDoctors,
      todayAppointments,
      completedToday,
      averageRating: avgRating[0]?.avg?.toFixed(1) || 'N/A'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/admin/users
router.get('/users', auth, authorize('admin'), async (req, res) => {
  try {
    const { role, search, department, isActive } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter).select('-password -otp -otpExpiry').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { role, isActive, specialization, department } = req.body;
    const updates = {};
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (specialization !== undefined) updates.specialization = specialization;
    if (department !== undefined) updates.department = department;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' }).select('-password -otp -otpExpiry');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/admin/departments
router.get('/departments', auth, authorize('admin', 'doctor'), async (req, res) => {
  try {
    const departments = await User.distinct('department', { role: 'doctor', department: { $ne: null } });
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

// POST /api/admin/feedback
router.post('/feedback', auth, async (req, res) => {
  try {
    const feedback = await Feedback.create({
      ...req.body,
      patientId: req.user._id
    });
    res.status(201).json(feedback);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// GET /api/admin/feedback
router.get('/feedback', auth, authorize('admin'), async (req, res) => {
  try {
    const feedback = await Feedback.find()
      .populate('patientId', 'name')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

module.exports = router;
