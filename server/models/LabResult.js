const mongoose = require('mongoose');

const labResultSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  testName: { type: String, required: true },
  testCategory: { type: String, enum: ['blood', 'urine', 'imaging', 'pathology', 'other'], default: 'blood' },
  status: {
    type: String,
    enum: ['ordered', 'sample-collected', 'processing', 'completed', 'cancelled'],
    default: 'ordered'
  },
  priority: { type: String, enum: ['normal', 'urgent', 'stat'], default: 'normal' },
  patientConsent: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  },
  // Lab queue fields
  labTokenNumber: { type: Number },
  labQueuePosition: { type: Number },
  labAccepted: { type: Boolean, default: false },
  labAcceptedAt: { type: Date },
  // Group multiple tests from same order
  orderGroup: { type: String },
  results: [{
    parameter: String,
    value: String,
    unit: String,
    referenceRange: String,
    flag: { type: String, enum: ['normal', 'low', 'high', 'critical'] }
  }],
  aiInterpretation: { type: String },
  reportUrl: { type: String },
  sampleCollectedAt: { type: Date },
  completedAt: { type: Date },
  notes: { type: String }
}, { timestamps: true });

labResultSchema.index({ patientId: 1 });
labResultSchema.index({ status: 1 });
labResultSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('LabResult', labResultSchema);
