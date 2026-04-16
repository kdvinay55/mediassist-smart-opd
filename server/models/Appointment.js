const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tokenNumber: { type: Number },
  date: { type: Date, required: true },
  timeSlot: { type: String },
  department: { type: String, required: true },
  type: { type: String, enum: ['new', 'follow-up', 'emergency'], default: 'new' },
  previousAppointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  previousConsultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  status: {
    type: String,
    enum: ['scheduled', 'checked-in', 'in-queue', 'vitals-done', 'in-consultation', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },
  priority: { type: String, enum: ['normal', 'urgent', 'emergency'], default: 'normal' },
  symptoms: [String],
  reasonForVisit: { type: String },
  notes: { type: String },
  queuePosition: { type: Number },
  estimatedWaitTime: { type: Number }, // minutes
  checkedInAt: { type: Date },
  completedAt: { type: Date }
}, { timestamps: true });

appointmentSchema.index({ patientId: 1, date: -1 });
appointmentSchema.index({ doctorId: 1, date: -1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ date: 1, department: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
