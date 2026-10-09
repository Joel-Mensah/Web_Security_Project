// src/services/emailService.js
// Nodemailer transport for delivering 2FA OTP codes via Gmail
'use strict';

const nodemailer = require('nodemailer');
require('dotenv').config();

function getGmailCredentials() {
  const user = process.env.GMAIL_USER || '';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) || pass.length !== 16) {
    throw new Error('Set a valid GMAIL_USER and 16-character GMAIL_APP_PASSWORD in backend/.env');
  }
  return { user, pass };
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
  },
});

/**
 * Send a 6-digit OTP code to the recipient's email address.
 *
 * @param {string} toEmail - Recipient email address
 * @param {string} otp     - 6-digit one-time passcode
 * @returns {Promise<object>} Nodemailer send result
 */
async function sendOTP(toEmail, otp) {
  const { user } = getGmailCredentials();

  const mailOptions = {
    from: `"Enterprise Security Portal" <${user}>`,
    to: toEmail,
    subject: 'Your 2FA Verification Code',
    text: `Your security verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this login code, please notify your system administrator immediately.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #0F172A; color: #F8FAFC; border-radius: 12px; border: 1px solid #1E293B;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #10B981; margin: 0; font-size: 24px; font-weight: bold;">EnterpriseAuth</h2>
          <p style="color: #94A3B8; font-size: 14px; margin-top: 6px;">Identity & Access Management</p>
        </div>
        <div style="background-color: #1E293B; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.06);">
          <p style="margin: 0 0 12px 0; color: #CBD5E1; font-size: 14px;">Use the verification code below to complete your login:</p>
          <div style="font-size: 32px; letter-spacing: 6px; font-weight: bold; color: #34D399; font-family: monospace; padding: 10px 0;">
            ${otp}
          </div>
          <p style="margin: 12px 0 0 0; color: #94A3B8; font-size: 12px;">Expires in <strong>10 minutes</strong>. Single-use only.</p>
        </div>
        <p style="color: #64748B; font-size: 12px; text-align: center; margin: 0;">
          If you did not attempt to sign in to EnterpriseAuth, someone may have entered your credentials. Please change your password immediately.
        </p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

async function verifyEmailService() {
  getGmailCredentials();
  await transporter.verify();
}

module.exports = { sendOTP, verifyEmailService };
