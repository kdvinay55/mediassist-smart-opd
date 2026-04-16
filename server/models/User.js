const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['patient', 'doctor', 'admin'], default: 'patient' },
  specialization: { type: String }, // for doctors
  department: { type: String }, // for doctors
  licenseNumber: { type: String }, // for doctors
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  avatar: { type: String },
  onboardingComplete: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
