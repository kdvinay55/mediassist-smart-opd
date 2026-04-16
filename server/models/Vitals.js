const mongoose = require('mongoose');

const vitalsSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bloodPressure: {
    systolic: Number,
    diastolic: Number
  },
  heartRate: { type: Number }, // bpm
  temperature: { type: Number }, // Fahrenheit
  oxygenSaturation: { type: Number }, // SpO2 %
  respiratoryRate: { type: Number }, // breaths/min
  weight: { type: Number }, // kg
  height: { type: Number }, // cm
  bmi: { type: Number },
  bloodSugar: { type: Number }, // mg/dL
  painLevel: { type: Number, min: 0, max: 10 },
  triageLevel: { type: String, enum: ['green', 'yellow', 'orange', 'red'], default: 'green' },
  aiTriageAssessment: { type: String },
  notes: { type: String }
}, { timestamps: true });

vitalsSchema.index({ patientId: 1 });
vitalsSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('Vitals', vitalsSchema);
