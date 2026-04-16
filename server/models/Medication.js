const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  genericName: { type: String },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  duration: { type: String },
  route: { type: String, enum: ['oral', 'topical', 'injection', 'inhalation', 'other'], default: 'oral' },
  instructions: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  isActive: { type: Boolean, default: true },
  sideEffects: [String],
  adherenceLog: [{
    date: Date,
    taken: Boolean,
    notes: String
  }]
}, { timestamps: true });

medicationSchema.index({ patientId: 1 });
medicationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Medication', medicationSchema);
