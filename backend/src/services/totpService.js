// src/services/totpService.js
// TOTP 2FA helpers using speakeasy + qrcode
'use strict';

const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');

const APP_NAME = 'EnterpriseAuth';

/**
 * Generate a new TOTP secret for a user.
 * @param {string} username
 * @returns {{ base32: string, otpauthUrl: string }}
 */
function generateSecret(username) {
  const secret = speakeasy.generateSecret({
    name:   `${APP_NAME} (${username})`,
    issuer: APP_NAME,
    length: 20,
  });
  return {
    base32:     secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
}

/**
 * Generate a base64-encoded QR code PNG from an otpauth:// URL.
 * @param {string} otpauthUrl
 * @returns {Promise<string>} data:image/png;base64,…
 */
async function generateQR(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'H',
    width: 256,
    margin: 2,
  });
}

/**
 * Verify a 6-digit TOTP token against a stored base32 secret.
 * Allows a ±1 window (30s before/after) to handle slight clock drift.
 *
 * @param {string} secret  - User's stored base32 TOTP secret
 * @param {string} token   - 6-digit token submitted by the user
 * @returns {boolean}
 */
function verifyToken(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token:    token.trim(),
    window:   2,   // ±2 steps (±60s) to tolerate minor phone/PC clock drift
  });
}

module.exports = { generateSecret, generateQR, verifyToken };
