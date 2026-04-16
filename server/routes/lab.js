const express = require('express');
const mongoose = require('mongoose');
const LabResult = require('../models/LabResult');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { interpretLabResults } = require('../services/ai');
const { createNotification } = require('../services/simulationEngine');

const router = express.Router();

// POST /api/lab/order — Doctor orders a single lab test (legacy, still works)
router.post('/order', auth, authorize('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId, consultationId, testName, testCategory, priority, notes, orderGroup } = req.body;

    const lab = await LabResult.create({
      patientId,
      appointmentId,
      consultationId,
      orderedBy: req.user._id,
      testName,
      testCategory: testCategory || 'blood',
      priority: priority || 'normal',
      notes,
      orderGroup: orderGroup || `${consultationId}-${Date.now()}`
    });

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('new-order', { lab });
      io.to(`patient-${patientId}`).emit('lab-ordered', { lab });
    }

    res.status(201).json(lab);
  } catch (error) {
    console.error('Lab order error:', error);
    res.status(500).json({ error: 'Failed to create lab order' });
  }
});

// POST /api/lab/order-batch — Doctor orders multiple tests as one batch (ONE notification to patient)
router.post('/order-batch', auth, authorize('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId, consultationId, tests, priority, notes } = req.body;
    if (!tests || tests.length === 0) return res.status(400).json({ error: 'No tests provided' });

    const orderGroup = new mongoose.Types.ObjectId().toString();
    const labs = [];

    for (const test of tests) {
      const lab = await LabResult.create({
        patientId,
        appointmentId,
        consultationId,
        orderedBy: req.user._id,
        testName: test.name,
        testCategory: test.category || 'blood',
        priority: priority || 'normal',
        notes,
        orderGroup
      });
      labs.push(lab);
    }

    // ONE notification for the entire batch
    const testNames = tests.map(t => t.name).join(', ');
    await createNotification(patientId, 'lab-ordered',
      'Lab Tests Ordered',
      `Dr. ${req.user.name} has ordered ${tests.length} lab test(s): ${testNames}. Please accept to proceed.`,
      labs[0]._id, 'LabResult');

    const io = req.app.get('io');
    if (io) {
      io.to('lab').emit('new-order', { labs });
      io.to(`patient-${patientId}`).emit('lab-ordered', { labs, orderGroup });
    }

    res.status(201).json(labs);
  } catch (error) {
    console.error('Batch lab order error:', error);
    res.status(500).json({ error: 'Failed to create lab orders' });
  }
});

// PUT /api/lab/consent-batch — Patient accepts/declines entire order group at once
router.put('/consent-batch', auth, authorize('patient'), async (req, res) => {
  try {
    const { orderGroup, consent } = req.body;
    if (!['accepted', 'declined'].includes(consent)) {
      return res.status(400).json({ error: 'Consent must be accepted or declined' });
    }

    const labs = await LabResult.find({ orderGroup, patientId: req.user._id, patientConsent: 'pending' });
    if (labs.length === 0) return res.status(404).json({ error: 'No pending lab orders found' });

    if (consent === 'accepted') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const existingTokens = await LabResult.countDocuments({
        labTokenNumber: { $exists: true, $ne: null },
        createdAt: { $gte: today, $lte: todayEnd }
      });
      const tokenNumber = existingTokens + 1;

      // Count unique orderGroups ahead in queue
      const waitingAhead = await LabResult.aggregate([
        { $match: { patientConsent: 'accepted', status: 'ordered', labAccepted: { $ne: true }, createdAt: { $gte: today, $lte: todayEnd } } },
        { $group: { _id: '$orderGroup' } }
      ]);
      const queuePosition = waitingAhead.length + 1;

      for (const lab of labs) {
        lab.patientConsent = 'accepted';
        lab.labTokenNumber = tokenNumber;
        lab.labQueuePosition = queuePosition;
        await lab.save();
      }

      // Notify lab about incoming patient
      const io = req.app.get('io');
      if (io) io.to('lab').emit('patient-accepted', { orderGroup, labs, queuePosition });

      res.json({ labs, labTokenNumber: tokenNumber, labQueuePosition: queuePosition });
    } else {
      for (const lab of labs) {
        lab.patientConsent = 'declined';
        lab.status = 'cancelled';
        await lab.save();
      }

      await createNotification(labs[0].orderedBy, 'system',
        'Lab Tests Declined',
        `Patient has declined ${labs.length} lab test(s).`,
        labs[0]._id, 'LabResult');

      res.json({ labs });
    }
  } catch (error) {
    console.error('Batch consent error:', error);
    res.status(500).json({ error: 'Failed to update consent' });
  }
});

// PUT /api/lab/:id/consent — Single lab consent (legacy)
router.put('/:id/consent', auth, authorize('patient'), async (req, res) => {
  try {
    const { consent } = req.body;
    if (!['accepted', 'declined'].includes(consent)) {
      return res.status(400).json({ error: 'Consent must be accepted or declined' });
    }
    const lab = await LabResult.findById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab order not found' });
    if (lab.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    lab.patientConsent = consent;
    if (consent === 'declined') lab.status = 'cancelled';
    await lab.save();
    res.json(lab);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update consent' });
  }
});

// PUT /api/lab/accept-patient — Lab tech accepts a patient group (starts their tests)
router.put('/accept-patient', auth, authorize('admin'), async (req, res) => {
  try {
    const { orderGroup } = req.body;
    const labs = await LabResult.find({ orderGroup, patientConsent: 'accepted', labAccepted: { $ne: true } })
      .populate('patientId', 'name');
    if (labs.length === 0) return res.status(404).json({ error: 'No accepted labs found' });

    for (const lab of labs) {
      lab.labAccepted = true;
      lab.labAcceptedAt = new Date();
      await lab.save();
    }

    const testNames = labs.map(l => l.testName).join(', ');
    await createNotification(labs[0].patientId._id || labs[0].patientId, 'lab-ready',
      'Lab Ready for You',
      `The lab is ready for your tests: ${testNames}. Please proceed for sample collection.`,
      labs[0]._id, 'LabResult');

    const io = req.app.get('io');
    if (io) io.to(`patient-${labs[0].patientId._id || labs[0].patientId}`).emit('lab-accepted', { orderGroup });

    res.json({ labs, message: `Accepted ${labs.length} tests for ${labs[0].patientId.name}` });
  } catch (error) {
    console.error('Accept patient error:', error);
    res.status(500).json({ error: 'Failed to accept patient' });
  }
});

// PUT /api/lab/collect-samples — Lab tech marks all samples collected for a group
router.put('/collect-samples', auth, authorize('admin'), async (req, res) => {
  try {
    const { orderGroup } = req.body;
    const labs = await LabResult.find({ orderGroup, labAccepted: true, status: 'ordered' })
      .populate('patientId', 'name');
    if (labs.length === 0) return res.status(404).json({ error: 'No labs to collect' });

    for (const lab of labs) {
      lab.status = 'sample-collected';
      lab.sampleCollectedAt = new Date();
      await lab.save();
    }

    const testNames = labs.map(l => l.testName).join(', ');
    await createNotification(labs[0].patientId._id || labs[0].patientId, 'lab-ready',
      'All Samples Collected',
      `Samples collected for: ${testNames}. You will be notified when results are ready.`,
      labs[0]._id, 'LabResult');

    const io = req.app.get('io');
    if (io) io.to(`patient-${labs[0].patientId._id || labs[0].patientId}`).emit('lab-update', { orderGroup, status: 'sample-collected' });

    res.json({ labs, message: `Collected ${labs.length} samples` });
  } catch (error) {
    console.error('Collect samples error:', error);
    res.status(500).json({ error: 'Failed to collect samples' });
  }
});

// PUT /api/lab/:id/status — Update individual lab status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };
    if (status === 'sample-collected') updates.sampleCollectedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();

    const lab = await LabResult.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' })
      .populate('patientId', 'name');

    if (lab) {
      const pid = lab.patientId._id || lab.patientId;
      if (status === 'sample-collected') {
        await createNotification(pid, 'lab-ready', 'Sample Collected',
          `Sample collected for ${lab.testName}. Processing will begin shortly.`, lab._id, 'LabResult');
      }
      if (status === 'processing') {
        await createNotification(pid, 'lab-ready', 'Lab Processing',
          `${lab.testName} is now being processed.`, lab._id, 'LabResult');
      }
      const io = req.app.get('io');
      if (io) io.to(`patient-${pid}`).emit('lab-update', { labId: lab._id, status });
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// PUT /api/lab/:id/results — Lab tech enters test results
router.put('/:id/results', auth, authorize('doctor', 'admin'), async (req, res) => {
  try {
    const { results } = req.body;

    const lab = await LabResult.findByIdAndUpdate(
      req.params.id,
      { results, status: 'completed', completedAt: new Date() },
      { returnDocument: 'after' }
    );
    if (!lab) return res.status(404).json({ error: 'Lab order not found' });

    const io = req.app.get('io');
    if (io) io.to(`patient-${lab.patientId}`).emit('lab-results-ready', { lab });

    await createNotification(lab.patientId, 'lab-ready',
      'Lab Results Ready',
      `Your ${lab.testName} results are now available. Please check your lab results.`,
      lab._id, 'LabResult');

    if (lab.orderedBy) {
      await createNotification(lab.orderedBy, 'lab-ready',
        'Lab Results Available',
        `Results for ${lab.testName} are ready for your patient.`,
        lab._id, 'LabResult');
    }

    // Check if all tests in group are completed
    if (lab.orderGroup) {
      const remaining = await LabResult.countDocuments({
        orderGroup: lab.orderGroup, status: { $ne: 'completed' }, patientConsent: { $ne: 'declined' }
      });
      if (remaining === 0) {
        await createNotification(lab.patientId, 'lab-ready',
          'All Lab Results Ready',
          `All your lab test results are now available. You can review them and book a follow-up appointment with your doctor.`,
          lab._id, 'LabResult');
      }
    }

    res.json(lab);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lab results' });
  }
});

// POST /api/lab/:id/ai-interpret
router.post('/:id/ai-interpret', auth, async (req, res) => {
  try {
    const lab = await LabResult.findById(req.params.id);
    if (!lab || !lab.results || lab.results.length === 0) {
      return res.status(400).json({ error: 'No results to interpret' });
    }
    const interpretation = await interpretLabResults(lab.results);
    lab.aiInterpretation = interpretation;
    await lab.save();
    res.json({ interpretation });
  } catch (error) {
    res.status(500).json({ error: 'AI interpretation failed' });
  }
});

// POST /api/lab/request-followup — Patient requests follow-up (direct queue join, no verification)
router.post('/request-followup', auth, authorize('patient'), async (req, res) => {
  try {
    const { labId } = req.body;
    const lab = await LabResult.findById(labId).populate('orderedBy', 'name department specialization');
    if (!lab) return res.status(404).json({ error: 'Lab not found' });
    if (lab.patientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const doctor = lab.orderedBy;
    const department = doctor.department || 'General Medicine';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const count = await Appointment.countDocuments({
      department, date: { $gte: today, $lte: todayEnd },
      tokenNumber: { $exists: true, $ne: null }
    });
    const tokenNumber = count + 1;
    const queuePosition = await Appointment.countDocuments({
      department, date: { $gte: today, $lte: todayEnd },
      status: { $in: ['checked-in', 'in-queue', 'vitals-done'] }
    }) + 1;

    // Find the original appointment and consultation linked to this lab
    const previousAppointmentId = lab.appointmentId || null;
    const previousConsultationId = lab.consultationId || null;

    const appointment = await Appointment.create({
      patientId: req.user._id,
      doctorId: doctor._id,
      department,
      date: new Date(),
      timeSlot: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      type: 'follow-up',
      previousAppointmentId,
      previousConsultationId,
      status: 'in-queue',
      tokenNumber,
      queuePosition,
      estimatedWaitTime: Math.floor(Math.random() * 20) + 5,
      checkedInAt: new Date(),
      symptoms: ['Lab results follow-up'],
      priority: 'normal'
    });

    await createNotification(doctor._id, 'appointment-reminder',
      'Follow-up Patient in Queue',
      `${req.user.name} has joined your queue for lab results follow-up. Token #${tokenNumber}.`,
      appointment._id, 'Appointment');

    res.status(201).json({
      appointment, tokenNumber, queuePosition,
      doctor: { name: doctor.name, department, specialization: doctor.specialization },
      message: `You've joined Dr. ${doctor.name}'s queue at position #${queuePosition}`
    });
  } catch (error) {
    console.error('Follow-up request error:', error);
    res.status(500).json({ error: 'Failed to create follow-up appointment' });
  }
});

// GET /api/lab/queue — Lab queue (grouped by orderGroup)
router.get('/queue', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const labs = await LabResult.find({
      patientConsent: 'accepted',
      status: { $ne: 'cancelled' },
      createdAt: { $gte: today, $lte: todayEnd }
    })
      .populate('patientId', 'name')
      .populate('orderedBy', 'name')
      .sort({ createdAt: 1 });

    const groups = {};
    labs.forEach(lab => {
      const key = lab.orderGroup || lab._id.toString();
      if (!groups[key]) {
        groups[key] = {
          orderGroup: key,
          patient: lab.patientId,
          doctor: lab.orderedBy,
          tests: [],
          labTokenNumber: lab.labTokenNumber,
          labQueuePosition: lab.labQueuePosition,
          labAccepted: lab.labAccepted,
          priority: lab.priority,
          createdAt: lab.createdAt,
          allSamplesCollected: true,
          allCompleted: true
        };
      }
      groups[key].tests.push({
        _id: lab._id,
        testName: lab.testName,
        testCategory: lab.testCategory,
        status: lab.status,
        results: lab.results,
        sampleCollectedAt: lab.sampleCollectedAt,
        completedAt: lab.completedAt
      });
      if (!['sample-collected', 'processing', 'completed'].includes(lab.status)) groups[key].allSamplesCollected = false;
      if (lab.status !== 'completed') groups[key].allCompleted = false;
    });

    res.json(Object.values(groups));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lab queue' });
  }
});

// GET /api/lab (list labs for user)
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'patient') filter.patientId = req.user._id;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.patientId && req.user.role !== 'patient') filter.patientId = req.query.patientId;
    if (req.query.consultationId) filter.consultationId = req.query.consultationId;

    const labs = await LabResult.find(filter)
      .populate('patientId', 'name')
      .populate('orderedBy', 'name department specialization')
      .sort({ createdAt: -1 });

    res.json(labs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lab results' });
  }
});

// GET /api/lab/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const lab = await LabResult.findById(req.params.id)
      .populate('patientId', 'name')
      .populate('orderedBy', 'name');
    if (!lab) return res.status(404).json({ error: 'Lab result not found' });
    res.json(lab);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lab result' });
  }
});

module.exports = router;
