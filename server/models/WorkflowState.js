const mongoose = require('mongoose');

const workflowStateSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  currentState: {
    type: String,
    enum: ['REGISTERED', 'QUEUED', 'VITALS_RECORDED', 'IN_CONSULTATION', 'LAB_ORDERED', 'LAB_COMPLETED', 'FOLLOWUP_SCHEDULED', 'COMPLETED'],
    default: 'REGISTERED'
  },
  stateHistory: [{
    state: String,
    enteredAt: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  roomNumber: { type: Number },
  tokenNumber: { type: Number },
  queuePosition: { type: Number },
  estimatedWaitTime: { type: Number },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

workflowStateSchema.index({ patientId: 1, isActive: 1 });
workflowStateSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('WorkflowState', workflowStateSchema);
