const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  overallRating: { type: Number, min: 1, max: 5, required: true },
  waitTimeRating: { type: Number, min: 1, max: 5 },
  doctorRating: { type: Number, min: 1, max: 5 },
  facilityRating: { type: Number, min: 1, max: 5 },
  staffRating: { type: Number, min: 1, max: 5 },
  comment: { type: String },
  wouldRecommend: { type: Boolean },
  categories: [{ type: String, enum: ['cleanliness', 'wait-time', 'staff-behavior', 'treatment', 'facilities', 'other'] }]
}, { timestamps: true });

feedbackSchema.index({ patientId: 1 });
feedbackSchema.index({ doctorId: 1 });
feedbackSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
