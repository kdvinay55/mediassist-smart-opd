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
  // 4-digit unique profile identifier shown to the user (e.g. "0421")
  profileId: { type: String, unique: true, sparse: true, index: true },
  onboardingComplete: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

// Generate a unique 4-digit profileId (0000-9999) before validation.
async function generateUniqueProfileId(Model) {
  // Try a handful of random IDs first; if collisions persist, fall back to scanning.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    // eslint-disable-next-line no-await-in-loop
    const exists = await Model.exists({ profileId: candidate });
    if (!exists) return candidate;
  }
  // Sequential fallback to guarantee a value if random keeps colliding.
  for (let n = 0; n < 10000; n += 1) {
    const candidate = String(n).padStart(4, '0');
    // eslint-disable-next-line no-await-in-loop
    const exists = await Model.exists({ profileId: candidate });
    if (!exists) return candidate;
  }
  throw new Error('No 4-digit profileId available');
}

userSchema.pre('validate', async function assignProfileId(next) {
  if (this.profileId) return next();
  try {
    this.profileId = await generateUniqueProfileId(this.constructor);
  } catch (err) {
    // Never block signup if profileId generation has a transient issue;
    // /auth/me will retry the assignment on the next request.
    console.error('profileId generation skipped:', err.message);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
