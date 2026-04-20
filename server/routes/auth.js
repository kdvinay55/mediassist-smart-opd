const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { generateOTP, sendOTP, normalizePhone } = require('../services/otp');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone: normalizePhone(phone) }] });
    if (existing) {
      return res.status(400).json({ error: 'Email or phone already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: normalizePhone(phone),
      password: hashedPassword,
      role: 'patient', // public signup is always patient; staff accounts are provisioned by admin
      otp,
      otpExpiry
    });

    let otpResult;
    try {
      otpResult = await sendOTP(email, phone, otp, name);
    } catch (sendErr) {
      console.error('Signup OTP delivery failed:', sendErr.message);
      await User.findByIdAndDelete(user._id).catch(() => {});
      return res.status(502).json({ error: 'Could not send verification code. Please try again.' });
    }

    const payload = {
      message: 'Account created. Verification code sent.',
      userId: user._id,
      otpSent: otpResult,
      requiresVerification: true
    };

    // SMS provider (Fast2SMS) requires DLT/website verification. Until that's done,
    // surface the OTP back to the client so the user can complete verification.
    // Email delivery still happens normally.
    if (!otpResult.sms) {
      payload.displayOtp = otp;
      payload.displayOtpReason = 'SMS delivery is unavailable. Use the code below to verify.';
    }

    res.status(201).json(payload);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await User.findOne({ email: identifier.toLowerCase() })
      : await User.findOne({ phone: normalizePhone(identifier) });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      // Send new OTP
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      let otpResult;
      try {
        otpResult = await sendOTP(user.email, user.phone, otp, user.name);
      } catch (e) {
        console.error('Login OTP delivery failed:', e.message);
        return res.status(502).json({ error: 'Could not send verification code. Please try again.' });
      }

      const resp = {
        error: 'Account not verified',
        userId: user._id,
        requiresVerification: true
      };
      if (!otpResult.sms) {
        resp.displayOtp = otp;
        resp.displayOtpReason = 'SMS delivery is unavailable. Use the code below to verify.';
      }
      return res.status(403).json(resp);
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department || '',
        avatar: user.avatar,
        onboardingComplete: user.onboardingComplete
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Create patient profile if role is patient
    if (user.role === 'patient') {
      await Patient.findOneAndUpdate(
        { userId: user._id },
        { userId: user._id },
        { upsert: true, returnDocument: 'after' }
      );
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.json({
      message: 'Verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department || '',
        onboardingComplete: user.onboardingComplete
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
      const result = await sendOTP(user.email, user.phone, otp, user.name);
      const payload = { message: 'Verification code resent', otpSent: result };
      if (!result.sms) {
        payload.displayOtp = otp;
        payload.displayOtpReason = 'SMS delivery is unavailable. Use the code below to verify.';
      }
      return res.json(payload);
    } catch (e) {
      console.error('Resend OTP delivery failed:', e.message);
      return res.status(502).json({ error: 'Could not send verification code. Please try again.' });
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@');
    let user;
    if (isEmail) {
      user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
      user = await User.findOne({ phone: normalizePhone(identifier) });
    }

    if (!user) {
      return res.json({ message: 'If an account exists, an OTP has been sent.' });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOTP(user.email, user.phone, otp, user.name);

    res.json({
      message: 'If an account exists, an OTP has been sent.',
      userId: user._id
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;

    if (!userId || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const user = req.user;
  let patientProfile = null;
  if (user.role === 'patient') {
    patientProfile = await Patient.findOne({ userId: user._id });
    // Auto-mark onboarding complete for existing patients who have profile data
    if (!user.onboardingComplete && patientProfile && (patientProfile.gender || patientProfile.dateOfBirth || patientProfile.emergencyContact?.name)) {
      user.onboardingComplete = true;
      await User.findByIdAndUpdate(user._id, { onboardingComplete: true });
    }
  }
  res.json({ user, patientProfile });
});

// PUT /api/auth/profile
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    const allowedFields = ['name', 'avatar'];
    const filtered = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    const user = await User.findByIdAndUpdate(req.user._id, filtered, { returnDocument: 'after' }).select('-password -otp -otpExpiry');

    // Update patient profile if provided
    if (updates.patientProfile && req.user.role === 'patient') {
      await Patient.findOneAndUpdate({ userId: req.user._id }, updates.patientProfile, { returnDocument: 'after', upsert: true });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

module.exports = router;
