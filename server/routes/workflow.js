const express = require('express');
const WorkflowState = require('../models/WorkflowState');
const { auth } = require('../middleware/auth');
const { transitionWorkflow, assignQueue, getOPDTraffic, scheduleFollowUp } = require('../services/simulationEngine');

const router = express.Router();

// GET /api/workflow/:appointmentId — get workflow state
router.get('/:appointmentId', auth, async (req, res) => {
  try {
    const workflow = await WorkflowState.findOne({ appointmentId: req.params.appointmentId })
      .populate('patientId', 'name email')
      .populate('appointmentId');
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

// POST /api/workflow/:appointmentId/transition — advance workflow
router.post('/:appointmentId/transition', auth, async (req, res) => {
  try {
    const { newState, metadata } = req.body;
    const result = await transitionWorkflow(req.params.appointmentId, newState, metadata);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Transition failed' });
  }
});

// POST /api/workflow/:appointmentId/check-in — check in + assign queue
router.post('/:appointmentId/check-in', auth, async (req, res) => {
  try {
    const result = await assignQueue(req.params.appointmentId);
    if (!result) return res.status(404).json({ error: 'Appointment not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Check-in failed' });
  }
});

// GET /api/workflow/opd/traffic — OPD traffic data
router.get('/opd/traffic', auth, async (req, res) => {
  try {
    const traffic = await getOPDTraffic();
    res.json(traffic);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get traffic' });
  }
});

// POST /api/workflow/follow-up/:consultationId
router.post('/follow-up/:consultationId', auth, async (req, res) => {
  try {
    const result = await scheduleFollowUp(req.params.consultationId);
    if (!result) return res.status(400).json({ error: 'No follow-up date set' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to schedule follow-up' });
  }
});

module.exports = router;
