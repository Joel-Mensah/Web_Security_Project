// src/routes/auth.js
// Authentication routes: login (step 1), 2FA verify (step 2), setup 2FA, logout
'use strict';

const express         = require('express');
const jwt             = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const { query }          = require('../config/db');
const { verifyPassword } = require('../services/cryptoService');
const { generateSecret, generateQR, verifyToken } = require('../services/totpService');
const { generateOTP, hashOTP, verifyOTP } = require('../services/otpService');
const { sendOTP }        = require('../services/emailService');
const { log, AuditAction } = require('../services/auditService');
const authenticate       = require('../middleware/authenticate');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function issueToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Step 1: Validate username + password → issue short-lived "pending 2FA" token
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    const ip = getIp(req);

    try {
      // Look up user by username
      const { rows } = await query(
        'SELECT id, username, email, password_hash, salt, mfa_secret, mfa_enabled, role, is_active FROM users WHERE username = $1',
        [username.toLowerCase()]
      );

      const user = rows[0];

      // Always run verify (even for non-existent users) to prevent timing attacks
      const dummySalt   = 'deadbeef'.repeat(4);
      const dummyHash   = '$argon2id$v=19$m=65536,t=3,p=4$' + 'A'.repeat(43) + '=' + '$' + 'A'.repeat(43) + '=';
      const salt        = user?.salt || dummySalt;
      const storedHash  = user?.password_hash || dummyHash;

      const valid = user ? await verifyPassword(password, salt, storedHash) : false;

      if (!user || !valid || !user.is_active) {
        await log({ userId: user?.id, action: AuditAction.LOGIN_FAILURE, ipAddress: ip, details: { username } });
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      await log({ userId: user.id, action: AuditAction.LOGIN_ATTEMPT, ipAddress: ip });

      // If 2FA not yet set up → issue setup token so frontend shows QR
      if (!user.mfa_enabled) {
        const pendingToken = issueToken(
          { id: user.id, username: user.username, role: user.role, pending2fa: true, requiresSetup: true },
          process.env.JWT_2FA_PENDING_EXPIRES_IN || '5m'
        );
        return res.json({ requires2FASetup: true, pendingToken });
      }

      // 2FA is enabled → issue a pending token for step 2
      const pendingToken = issueToken(
        { id: user.id, username: user.username, role: user.role, pending2fa: true },
        process.env.JWT_2FA_PENDING_EXPIRES_IN || '5m'
      );
      return res.json({ requires2FA: true, pendingToken });

    } catch (err) {
      console.error('[AUTH] /login error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/auth/setup-2fa ────────────────────────────────────────────────
// First-time: generate + store TOTP secret, return QR code
router.post('/setup-2fa', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
  if (!payload.pending2fa || !payload.requiresSetup) {
    return res.status(400).json({ message: 'Not in setup state' });
  }

  try {
    const { base32, otpauthUrl } = generateSecret(payload.username);
    const qrDataUrl = await generateQR(otpauthUrl);

    // Store the secret (mark mfa_enabled after first successful verify)
    await query(
      'UPDATE users SET mfa_secret = $1 WHERE id = $2',
      [base32, payload.id]
    );

    await log({ userId: payload.id, actorId: payload.id, action: AuditAction.MFA_SETUP, ipAddress: getIp(req) });

    res.json({ qrDataUrl, manualCode: base32 });
  } catch (err) {
    console.error('[AUTH] /setup-2fa error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/auth/verify-2fa ────────────────────────────────────────────────
// Step 2: Verify TOTP → issue full JWT
router.post(
  '/verify-2fa',
  [body('token').trim().isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'No pending token' });

    let payload;
    try {
      payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Pending token invalid or expired' });
    }
    if (!payload.pending2fa) return res.status(400).json({ message: 'Not a pending 2FA token' });

    const ip = getIp(req);
    try {
      const { rows } = await query(
        'SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1',
        [payload.id]
      );
      const user = rows[0];
      if (!user?.mfa_secret) return res.status(400).json({ message: '2FA not configured' });

      const valid = verifyToken(user.mfa_secret, req.body.token);
      if (!valid) {
        await log({ userId: payload.id, action: AuditAction.LOGIN_2FA_FAILURE, ipAddress: ip });
        return res.status(401).json({ message: 'Invalid 2FA token' });
      }

      // Mark mfa_enabled on first successful verify
      if (!user.mfa_enabled) {
        await query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [payload.id]);
      }

      // Update last_login
      await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [payload.id]);
      await log({ userId: payload.id, action: AuditAction.LOGIN_SUCCESS, ipAddress: ip });
      await log({ userId: payload.id, action: AuditAction.LOGIN_2FA_SUCCESS, ipAddress: ip });

      // Issue full access token (no pending2fa flag)
      const accessToken = issueToken(
        { id: payload.id, username: payload.username, role: payload.role },
        process.env.JWT_EXPIRES_IN || '8h'
      );
      res.json({ accessToken, user: { id: payload.id, username: payload.username, role: payload.role } });

    } catch (err) {
      console.error('[AUTH] /verify-2fa error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(5, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

// ─── POST /api/auth/send-email-otp ─────────────────────────────────────────────
// Request an email OTP when TOTP is unavailable / as backup
router.post('/send-email-otp', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'No pending token' });

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Pending token invalid or expired' });
  }
  if (!payload.pending2fa) return res.status(400).json({ message: 'Not a pending 2FA token' });

  const ip = getIp(req);
  try {
    const { rows } = await query(
      'SELECT id, username, email, is_active FROM users WHERE id = $1',
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(404).json({ message: 'User not found or inactive' });
    }

    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    // Set 10-minute expiry
    await query(
      `UPDATE users
       SET email_otp_hash = $1,
           email_otp_expires_at = NOW() + INTERVAL '10 minutes'
       WHERE id = $2`,
      [otpHash, user.id]
    );

    await sendOTP(user.email, otp);

    await log({
      userId: user.id,
      actorId: user.id,
      action: AuditAction.EMAIL_OTP_SENT,
      ipAddress: ip,
      details: { maskedEmail: maskEmail(user.email) }
    });

    res.json({
      message: 'Verification code sent to your email',
      maskedEmail: maskEmail(user.email)
    });
  } catch (err) {
    console.error('[AUTH] /send-email-otp error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to send verification email' });
  }
});

// ─── POST /api/auth/verify-email-otp ───────────────────────────────────────────
// Verify the 6-digit email OTP and issue full JWT
router.post(
  '/verify-email-otp',
  [body('token').trim().isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'No pending token' });

    let payload;
    try {
      payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Pending token invalid or expired' });
    }
    if (!payload.pending2fa) return res.status(400).json({ message: 'Not a pending 2FA token' });

    const ip = getIp(req);
    try {
      const { rows } = await query(
        'SELECT id, username, role, email_otp_hash, email_otp_expires_at FROM users WHERE id = $1',
        [payload.id]
      );
      const user = rows[0];
      if (!user) return res.status(404).json({ message: 'User not found' });

      const isValid = verifyOTP(req.body.token, user.email_otp_hash, user.email_otp_expires_at);
      if (!isValid) {
        await log({ userId: user.id, action: AuditAction.EMAIL_OTP_FAILURE, ipAddress: ip });
        return res.status(401).json({ message: 'Invalid or expired verification code' });
      }

      // Single-use: clear OTP after successful verification
      await query(
        `UPDATE users
         SET email_otp_hash = NULL,
             email_otp_expires_at = NULL,
             last_login_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      await log({ userId: user.id, action: AuditAction.LOGIN_SUCCESS, ipAddress: ip });
      await log({ userId: user.id, action: AuditAction.EMAIL_OTP_SUCCESS, ipAddress: ip });

      const accessToken = issueToken(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_EXPIRES_IN || '8h'
      );

      res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
      console.error('[AUTH] /verify-email-otp error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  await log({ userId: req.user.id, actorId: req.user.id, action: AuditAction.LOGOUT, ipAddress: getIp(req) });
  res.json({ message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, username, email, role, mfa_enabled, created_at, last_login_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ message: 'User not found' });
  res.json(rows[0]);
});

module.exports = router;
