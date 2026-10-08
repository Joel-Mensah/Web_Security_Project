// src/services/otpService.js
// Cryptographic OTP generator and validator for email-based 2FA
'use strict';

const crypto = require('crypto');

/**
 * Generate a cryptographically random 6-digit numeric OTP code.
 * @returns {string} 6-digit OTP string
 */
function generateOTP() {
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * Hash an OTP using SHA-256 for secure database storage.
 * @param {string} otp - Plain 6-digit OTP
 * @returns {string} SHA-256 hex digest
 */
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

/**
 * Verify a submitted OTP against the stored SHA-256 hash and expiration timestamp.
 *
 * @param {string} submittedOtp  - Plain OTP entered by user
 * @param {string} storedHash    - SHA-256 hash stored in DB
 * @param {Date|string} expiresAt - Timestamp when the OTP expires
 * @returns {boolean} True if code matches and is not expired
 */
function verifyOTP(submittedOtp, storedHash, expiresAt) {
  if (!submittedOtp || !storedHash || !expiresAt) return false;

  // Check expiration
  if (Date.now() > new Date(expiresAt).getTime()) {
    return false;
  }

  const submittedHash = hashOTP(submittedOtp);
  const hashBuffer = Buffer.from(storedHash, 'hex');
  const submittedBuffer = Buffer.from(submittedHash, 'hex');

  if (hashBuffer.length !== submittedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, submittedBuffer);
}

module.exports = { generateOTP, hashOTP, verifyOTP };
