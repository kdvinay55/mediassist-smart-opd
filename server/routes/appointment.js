const express = require('express');
const Appointment = require('../models/Appointment');
const Vitals = require('../models/Vitals');
const User = require('../models/User');
const Patient = require('../models/Patient');
const WorkflowState = require('../models/WorkflowState');
const Consultation = require('../models/Consultation');
const { createNotification } = require('../services/simulationEngine');
const { auth, authorize } = require('../middleware/auth');
const { generateQrToken, toDataURL, toBuffer } = require('../services/qr');

const router = express.Router();

// GET /api/appointments/available-slots — Get available time slots for a date + department
router.get('/available-slots', auth, async (req, res) => {
  try {
    const { date, department } = req.query;
    if (!date || !department) return res.status(400).json({ error: 'date and department are required' });

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const booked = await Appointment.find({
      department,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled', 'no-show'] }
    }).select('timeSlot');

    const bookedSlots = booked.map(a => a.timeSlot);

    const allSlots = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM'];

    // If booking for today, filter out past time slots
    const now = new Date();
    const isToday = startOfDay.toDateString() === now.toDateString();

    const slots = allSlots.map(slot => {
      let available = !bookedSlots.includes(slot);

      if (isToday && available) {
        const [time, period] = slot.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) {
          available = false;
        }
      }

      return { slot, available };
    });

    res.json({ slots, totalAvailable: slots.filter(s => s.available).length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get available slots' });
  }
});

// POST /api/appointments
router.post('/', auth, async (req, res) => {
  try {
    const { date, department, type, symptoms, reasonForVisit, doctorId, timeSlot } = req.body;

    // Generate token number for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if slot is still available
    const slotTaken = await Appointment.findOne({
      department,
      timeSlot,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: { $nin: ['cancelled', 'no-show'] }
    });
    if (slotTaken) {
      return res.status(400).json({ error: 'This time slot is no longer available. Please choose another.' });
    }

    const count = await Appointment.countDocuments({
      department,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    const appointment = await Appointment.create({
      patientId: req.user._id,
      doctorId,
      date,
      timeSlot,
      department,
      type: type || 'new',
      symptoms: symptoms || [],
      reasonForVisit,
      tokenNumber: count + 1,
      qrToken: generateQrToken(),
      status: 'scheduled'
    });

    // Pre-render a data-URL QR so the patient app can show it instantly.
    let qrDataUrl = null;
    try { qrDataUrl = await toDataURL(appointment.qrToken); } catch (e) { console.warn('QR render failed:', e.message); }

    // Notify all receptionists / admin users about new appointment
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
    for (const admin of admins) {
      await createNotification(admin._id, 'appointment-reminder',
        'New Appointment Booked',
        `${req.user.name} booked an appointment in ${department} for ${timeSlot} on ${new Date(date).toLocaleDateString()}`,
        appointment._id, 'Appointment');
    }

    // Emit socket event 
    const io = req.app.get('io');
    if (io) {
      io.to(`dept-${department}`).emit('queue-update', { appointment });
      io.emit('new-appointment', { appointment });
    }

    res.status(201).json({ ...appointment.toObject(), qrDataUrl });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// GET /api/appointments
router.get('/', auth, async (req, res) => {
  try {
    const { status, date, department } = req.query;
    const filter = {};

    if (req.user.role === 'patient') {
      filter.patientId = req.user._id;
    } else if (req.user.role === 'doctor') {
      filter.doctorId = req.user._id;
    }

    if (status) filter.status = status;
    if (department) filter.department = department;
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: d, $lte: end };
    }

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'name email phone')
      .populate('doctorId', 'name specialization')
      .sort({ date: -1, tokenNumber: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get appointments' });
  }
});

// GET /api/appointments/queue/:department
router.get('/queue/:department', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const queue = await Appointment.find({
      department: req.params.department,
      date: { $gte: today, $lte: endOfDay },
      status: { $in: ['checked-in', 'in-queue', 'vitals-done'] }
    })
      .populate('patientId', 'name')
      .sort({ priority: -1, tokenNumber: 1 });

    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

// PUT /api/appointments/:id/status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };

    if (status === 'checked-in') updates.checkedInAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();

    const appointment = await Appointment.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' })
      .populate('patientId', 'name')
      .populate('doctorId', 'name specialization');

    const io = req.app.get('io');
    if (io) {
      io.to(`dept-${appointment.department}`).emit('queue-update', { appointment });
      io.to(`patient-${appointment.patientId._id}`).emit('appointment-update', { appointment });
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// POST /api/appointments/:id/vitals
router.post('/:id/vitals', auth, authorize('doctor', 'admin'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const vitals = await Vitals.create({
      ...req.body,
      patientId: appointment.patientId,
      appointmentId: appointment._id,
      recordedBy: req.user._id
    });

    // Calculate BMI
    if (vitals.weight && vitals.height) {
      vitals.bmi = +(vitals.weight / ((vitals.height / 100) ** 2)).toFixed(1);
      await vitals.save();
    }

    appointment.status = 'vitals-done';
    await appointment.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`patient-${appointment.patientId}`).emit('vitals-recorded', { vitals });
    }

    res.status(201).json(vitals);
  } catch (error) {
    console.error('Vitals error:', error);
    res.status(500).json({ error: 'Failed to record vitals' });
  }
});

// GET /api/appointments/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patientId', 'name email phone')
      .populate('doctorId', 'name specialization');
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get appointment' });
  }
});

// GET /api/appointments/:id/patient-profile — Get full patient profile for an appointment (admin/doctor)
router.get('/:id/patient-profile', auth, authorize('admin', 'doctor'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const user = await User.findById(appointment.patientId).select('name email phone createdAt');
    const patient = await Patient.findOne({ userId: appointment.patientId });

    // Get past appointments
    const pastAppointments = await Appointment.find({
      patientId: appointment.patientId,
      _id: { $ne: appointment._id },
      status: 'completed'
    }).select('department date symptoms reasonForVisit').sort({ date: -1 }).limit(5);

    // Get past vitals
    const lastVitals = await Vitals.findOne({ patientId: appointment.patientId }).sort({ createdAt: -1 });

    res.json({
      user,
      profile: patient,
      pastAppointments,
      lastVitals
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get patient profile' });
  }
});

// POST /api/appointments/:id/verify-assign — Admin verifies patient identity + auto-assigns doctor
router.post('/:id/verify-assign', auth, authorize('admin'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    // Find available doctor in the department
    const department = appointment.department;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Get all doctors in this department
    const doctors = await User.find({ role: 'doctor', department, isActive: true });
    if (doctors.length === 0) {
      return res.status(400).json({ error: `No doctors available in ${department}` });
    }

    // Find the doctor with fewest appointments today (load balancing)
    let bestDoctor = null;
    let minCount = Infinity;
    for (const doc of doctors) {
      const count = await Appointment.countDocuments({
        doctorId: doc._id,
        date: { $gte: today, $lte: todayEnd },
        status: { $nin: ['cancelled', 'no-show'] }
      });
      if (count < minCount) {
        minCount = count;
        bestDoctor = doc;
      }
    }

    // Assign doctor and update status
    const roomNumber = Math.floor(Math.random() * 20) + 101;
    appointment.doctorId = bestDoctor._id;
    appointment.status = 'checked-in';
    appointment.checkedInAt = new Date();
    await appointment.save();

    // Create/update workflow state
    let workflow = await WorkflowState.findOne({ appointmentId: appointment._id });
    if (!workflow) {
      workflow = await WorkflowState.create({
        patientId: appointment.patientId,
        appointmentId: appointment._id,
        currentState: 'QUEUED',
        roomNumber,
        stateHistory: [
          { state: 'REGISTERED', enteredAt: appointment.createdAt },
          { state: 'QUEUED', enteredAt: new Date(), metadata: { doctorAssigned: bestDoctor.name, roomNumber, verifiedBy: req.user.name } }
        ]
      });
    } else {
      workflow.roomNumber = roomNumber;
      workflow.stateHistory.push({ state: 'QUEUED', enteredAt: new Date(), metadata: { doctorAssigned: bestDoctor.name, roomNumber, verifiedBy: req.user.name } });
      if (workflow.currentState === 'REGISTERED') workflow.currentState = 'QUEUED';
      await workflow.save();
    }

    // Notify patient
    await createNotification(appointment.patientId, 'doctor-assigned',
      'Doctor Assigned',
      `You have been assigned to Dr. ${bestDoctor.name} (${bestDoctor.specialization || department}) in Room ${roomNumber}`,
      appointment._id, 'Appointment');

    const io = req.app.get('io');
    if (io) {
      io.to(`patient-${appointment.patientId}`).emit('doctor-assigned', {
        appointmentId: appointment._id,
        doctor: { name: bestDoctor.name, specialization: bestDoctor.specialization, department },
        roomNumber
      });
    }

    const populated = await Appointment.findById(appointment._id)
      .populate('patientId', 'name email phone')
      .populate('doctorId', 'name specialization department');

    res.json({
      appointment: populated,
      assignedDoctor: { name: bestDoctor.name, specialization: bestDoctor.specialization, department },
      roomNumber,
      message: `Patient verified and assigned to Dr. ${bestDoctor.name}, Room ${roomNumber}`
    });
  } catch (error) {
    console.error('Verify-assign error:', error);
    res.status(500).json({ error: 'Failed to verify and assign doctor' });
  }
});

// GET /api/appointments/:id/vitals-data — Get vitals + appointment info for consultation room
router.get('/:id/vitals-data', auth, authorize('doctor', 'admin'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .select('department reasonForVisit symptoms type date timeSlot');
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const vitals = await Vitals.findOne({ appointmentId: req.params.id }).sort({ createdAt: -1 }).lean();

    res.json({
      vitals: vitals || null,
      appointment: {
        department: appointment.department,
        reasonForVisit: appointment.reasonForVisit,
        symptoms: appointment.symptoms,
        type: appointment.type,
        date: appointment.date,
        timeSlot: appointment.timeSlot
      }
    });
  } catch (error) {
    console.error('Vitals data error:', error.message);
    res.status(500).json({ error: 'Failed to get vitals data' });
  }
});

// GET /api/appointments/doctor/assigned — Get doctor's assigned patients for today
router.get('/doctor/assigned', auth, authorize('doctor'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      doctorId: req.user._id,
      date: { $gte: today, $lte: todayEnd },
      status: { $nin: ['cancelled', 'no-show'] }
    })
      .populate('patientId', 'name email phone')
      .sort({ tokenNumber: 1 });

    // Enrich with vitals, workflow state, and consultation ID
    const enriched = await Promise.all(appointments.map(async (apt) => {
      const vitals = await Vitals.findOne({ appointmentId: apt._id }).sort({ createdAt: -1 });
      const workflow = await WorkflowState.findOne({ appointmentId: apt._id });
      const consultation = await Consultation.findOne({ appointmentId: apt._id }).select('_id');
      return {
        ...apt.toObject(),
        latestVitals: vitals,
        workflowState: workflow?.currentState,
        roomNumber: workflow?.roomNumber,
        consultationId: consultation?._id || null
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Doctor assigned error:', error);
    res.status(500).json({ error: 'Failed to get assigned patients' });
  }
});

// GET /api/appointments/:id/qr — Returns the kiosk QR code as a PNG image.
// Patient (owner) or any staff (doctor/admin/lab/reception) may fetch it.
router.get('/:id/qr', auth, async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const isOwner = appt.patientId.toString() === req.user._id.toString();
    const isStaff = ['doctor', 'admin', 'lab', 'reception'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Not authorized' });

    if (!appt.qrToken) {
      appt.qrToken = generateQrToken();
      await appt.save();
    }

    const png = await toBuffer(appt.qrToken, { width: 360 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(png);
  } catch (error) {
    console.error('QR endpoint error:', error.message);
    res.status(500).json({ error: 'Failed to render QR' });
  }
});

module.exports = router;
