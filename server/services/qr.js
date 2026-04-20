// QR code helpers for the Raspberry-Pi vitals kiosk flow.
const crypto = require('crypto');
const QRCode = require('qrcode');

const QR_PREFIX = 'SMARTOPD:APT';

function generateQrToken() {
  // 24-byte url-safe random token; safe to print on a small QR.
  return crypto.randomBytes(18).toString('base64url');
}

function qrPayload(token) {
  return `${QR_PREFIX}:${token}`;
}

function parseQrPayload(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // Accept either the prefixed payload or the raw token.
  const match = trimmed.match(/^SMARTOPD:APT:([A-Za-z0-9_-]{16,})$/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

async function toDataURL(token, opts = {}) {
  return QRCode.toDataURL(qrPayload(token), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opts.width || 256
  });
}

async function toBuffer(token, opts = {}) {
  return QRCode.toBuffer(qrPayload(token), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opts.width || 320,
    type: 'png'
  });
}

module.exports = { generateQrToken, qrPayload, parseQrPayload, toDataURL, toBuffer, QR_PREFIX };
