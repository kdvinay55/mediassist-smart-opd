const nodemailer = require('nodemailer');
const twilio = require('twilio');

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizePhone(phone) {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    cleaned = '+91' + cleaned;
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

async function sendEmailOTP(email, otp, name) {
  const mailOptions = {
    from: `"SRM BioVault" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your SRM BioVault Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #1A4B8C, #0D3A7A); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🏥 SRM BioVault</h1>
        </div>
        <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
          <p>Hello ${name || 'there'},</p>
          <p>Your verification code is:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0066CC; background: #EBF5FF; padding: 12px 24px; border-radius: 8px;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. Do not share it with anyone.</p>
        </div>
      </div>
    `
  };

  return emailTransporter.sendMail(mailOptions);
}

async function sendSMSOTP(phone, otp) {
  const normalizedPhone = normalizePhone(phone);
  return twilioClient.messages.create({
    body: `Your SRM BioVault verification code is: ${otp}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: normalizedPhone
  });
}

async function sendOTP(email, phone, otp, name) {
  const results = { email: false, sms: false };

  try {
    await sendEmailOTP(email, otp, name);
    results.email = true;
  } catch (err) {
    console.error('Email OTP error:', err.message);
  }

  try {
    await sendSMSOTP(phone, otp);
    results.sms = true;
  } catch (err) {
    console.error('SMS OTP error:', err.message);
  }

  if (!results.email && !results.sms) {
    throw new Error('Failed to send OTP via both channels');
  }

  return results;
}

module.exports = { generateOTP, normalizePhone, sendOTP, sendEmailOTP, sendSMSOTP };
