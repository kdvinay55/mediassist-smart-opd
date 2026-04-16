const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  allergies: [String],
  chronicConditions: [String],
  currentMedications: [String],
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    validTill: Date
  },
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    status: { type: String, enum: ['active', 'resolved', 'managed'] },
    notes: String
  }]
}, { timestamps: true });

patientSchema.index({ userId: 1 });

module.exports = mongoose.model('Patient', patientSchema);
