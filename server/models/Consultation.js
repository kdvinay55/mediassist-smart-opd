const mongoose = require('mongoose');

const consultationSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chiefComplaint: { type: String },
  symptoms: [String],
  symptomDuration: { type: String },
  examination: { type: String },
  aiSuggestedDiagnosis: [{ condition: String, confidence: Number }],
  finalDiagnosis: [{ condition: String, icdCode: String }],
  treatmentPlan: { type: String },
  prescriptions: [{
    medication: String,
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String
  }],
  labOrderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabResult' }],
  referrals: [{
    department: String,
    doctor: String,
    reason: String,
    urgency: { type: String, enum: ['routine', 'urgent', 'emergency'] },
    referralLetter: String,
    createdAt: { type: Date, default: Date.now }
  }],
  followUpDate: { type: Date },
  followUpInstructions: { type: String },
  aiChatHistory: [{
    role: { type: String, enum: ['user', 'assistant'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['in-progress', 'completed', 'reviewed'], default: 'in-progress' },
  notes: { type: String }
}, { timestamps: true });

consultationSchema.index({ patientId: 1 });
consultationSchema.index({ doctorId: 1 });
consultationSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('Consultation', consultationSchema);
