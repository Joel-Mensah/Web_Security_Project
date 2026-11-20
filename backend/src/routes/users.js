// src/routes/users.js
// User CRUD with RBAC enforcement
'use strict';

const express  = require('express');
const { body, param, validationResult } = require('express-validator');
const crypto = require('crypto');

const { query }             = require('../config/db');
const { generateSalt, hashPassword } = require('../services/cryptoService');
const { log, AuditAction }  = require('../services/auditService');
const { sendAccountSetupLink } = require('../services/emailService');
const { ensureDatabaseOnline } = require('../middleware/requireDatabase');
const authenticate          = require('../middleware/authenticate');
const authorizeRole         = require('../middleware/authorizeRole');

const router = express.Router();

// All user routes require a valid JWT
router.use(authenticate);

const VALID_ROLES = ['inputer', 'manager', 'admin', 'administrator'];

function getSetupLinkErrorMessage(err, stage) {
  const errorMessage = typeof err?.message === 'string' ? err.message : '';
  if (stage === 'Gmail delivery') {
    if (
      errorMessage.includes('Set a valid GMAIL_USER') ||
      err.code === 'EAUTH' ||
      err.responseCode === 535
    ) {
      return 'The Gmail settings are missing or rejected. Check GMAIL_USER and GMAIL_APP_PASSWORD in the backend environment, then redeploy the API.';
    }
    if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ENOTFOUND'].includes(err.code)) {
      return 'The API could not connect to Gmail. Check the backend logs and try again.';
    }
    return `Gmail could not send the setup email${err.code ? ` (${err.code})` : ''}. Check the backend logs for details.`;
  }

  if (stage === 'audit logging') {
    return 'The setup email was sent, but the action could not be recorded. Check backend logs before retrying.';
  }

  if (stage === 'validating setup URL') {
    return 'The setup page URL is missing or invalid. Set ACCOUNT_SETUP_URL to the public frontend URL in the backend environment, then redeploy the API.';
  }

  console.error(`[USERS] Setup-link request failed during ${stage} (${err.code || 'NO_CODE'}):`, err.message);
  return `The setup-link request failed during ${stage}. Check the backend function logs and try again.`;
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Managers, Admins, Administrators can list users
router.get(
  '/',
  authorizeRole(['manager', 'admin', 'administrator']),
  async (req, res) => {
    try {
      const page     = Math.max(1, parseInt(req.query.page  || '1',  10));
      const pageSize = Math.min(100, parseInt(req.query.limit || '20', 10));
      const offset   = (page - 1) * pageSize;
      const { rows }       = await query(
        `SELECT id, username, email, role, mfa_enabled, is_active, last_login_at, created_at,
                (credential_setup_required AND is_active) AS setup_pending,
                CASE
                  WHEN password_hash LIKE '$argon2id$%' THEN 'Argon2id'
                  WHEN password_hash LIKE '$2a$%' OR password_hash LIKE '$2b$%' THEN 'bcrypt'
                  ELSE 'Unknown'
                END AS password_algorithm,
                (salt IS NOT NULL AND salt <> '') AS salt_present
         FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );
      const { rows: count } = await query('SELECT COUNT(*) FROM users');

      res.json({ users: rows, total: parseInt(count[0].count), page, pageSize });
    } catch (err) {
      console.error('[USERS] GET / error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Return one account's stored credential verifiers only on explicit admin request.
router.get(
  '/:id/credential-material',
  authorizeRole(['admin', 'administrator']),
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows } = await query(
        'SELECT id, username, password_hash, salt FROM users WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ message: 'User not found' });

      // Do not disclose credential material unless the access event is recorded.
      await query(
        `INSERT INTO audit_logs (user_id, actor_id, action, ip_address, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          rows[0].id,
          req.user.id,
          AuditAction.USER_CREDENTIALS_VIEWED,
          getIp(req),
          JSON.stringify({ username: rows[0].username }),
        ]
      );

      res.set('Cache-Control', 'no-store');
      res.json({ password_hash: rows[0].password_hash, salt: rows[0].salt });
    } catch (err) {
      console.error('[USERS] Credential material request failed:', err.message);
      res.status(500).json({ message: 'Could not load credential details' });
    }
  }
);

router.get(
  '/security-overview',
  authorizeRole(['admin', 'administrator']),
  async (_req, res) => {
    res.json({
      passwordHashing: {
        algorithm: 'Argon2id',
        memoryCostKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
      salt: {
        bytesPerUser: 16,
        uniquePerUser: true,
      },
      pepper: {
        configured: Boolean(process.env.SECRET_PEPPER),
        storage: 'backend environment',
      },
      plaintextPasswordsRecoverable: false,
    });
  }
);

router.get(
  '/dashboard-summary',
  authorizeRole(['manager', 'admin', 'administrator']),
  async (_req, res) => {
    try {
      const { rows } = await query(
        `SELECT COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE is_active)::int AS active_users,
                COUNT(*) FILTER (WHERE mfa_enabled AND is_active)::int AS mfa_enabled_users,
                COUNT(*) FILTER (WHERE credential_setup_required AND is_active)::int AS setup_pending
         FROM users`
      );
      res.json(rows[0]);
    } catch (err) {
      console.error('[USERS] GET /dashboard-summary error:', err.message);
      res.status(500).json({ message: 'Could not load dashboard summary' });
    }
  }
);

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
router.get(
  '/:id',
  authorizeRole(['manager', 'admin', 'administrator']),
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows } = await query(
        'SELECT id, username, email, role, mfa_enabled, is_active, last_login_at, created_at FROM users WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ message: 'User not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/users ──────────────────────────────────────────────────────────
// Only Manager and Administrator can add Inputers
// Managers may only create 'inputer' accounts
router.post(
  '/',
  authorizeRole(['manager', 'administrator']),
  [
    body('username').trim().isLength({ min: 3, max: 64 }).matches(/^[a-zA-Z0-9_]+$/),
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 10 }).withMessage('Password must be at least 10 characters'),
    body('role').optional().isIn(VALID_ROLES),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email } = req.body;
    const password = req.body.password || crypto.randomBytes(32).toString('base64url');
    let   { role = 'inputer' } = req.body;

    // Managers can only create inputer accounts
    if (req.user.role === 'manager' && role !== 'inputer') {
      return res.status(403).json({ message: 'Managers may only create Inputer accounts' });
    }

    try {
      const salt = generateSalt();
      const hash = await hashPassword(password, salt);

      const { rows } = await query(
        `INSERT INTO users (username, email, password_hash, salt, role, credential_setup_required)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, username, email, role, created_at, salt, password_hash, credential_setup_required AS setup_pending`,
        [username.toLowerCase(), email, hash, salt, role]
      );
      const newUser = rows[0];

      await log({
        userId:    newUser.id,
        actorId:   req.user.id,
        action:    AuditAction.USER_CREATED,
        ipAddress: getIp(req),
        details:   { username: newUser.username, role: newUser.role, createdBy: req.user.username },
      });

      res.status(201).json(newUser);
    } catch (err) {
      if (err.code === '23505') { // unique_violation
        return res.status(409).json({ message: 'Username or email already exists' });
      }
      console.error('[USERS] POST / error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/send-setup-link',
  authorizeRole(['manager', 'administrator']),
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    let stage = 'cloud connection';
    try {
      await ensureDatabaseOnline();
      stage = 'loading user account';
      const { rows } = await query(
        'SELECT id, username, email, role, is_active, credential_setup_required FROM users WHERE id = $1',
        [req.params.id]
      );
      const user = rows[0];
      if (!user || !user.is_active) {
        return res.status(404).json({ message: 'Active user not found' });
      }
      if (!user.credential_setup_required) {
        return res.status(409).json({ message: 'This user has already set a password; no setup link is needed.' });
      }
      if (req.user.role === 'manager' && user.role !== 'inputer') {
        return res.status(403).json({ message: 'Managers may only send setup links to Inputer accounts' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      stage = 'saving setup link';
      await query(
        `UPDATE users
         SET password_setup_token_hash = $1,
             password_setup_expires_at = NOW() + INTERVAL '1 hour'
         WHERE id = $2`,
        [tokenHash, user.id]
      );

      stage = 'validating setup URL';
      const setupBase = process.env.ACCOUNT_SETUP_URL || process.env.FRONTEND_URL;
      const setupUrl = new URL('/setup-password', setupBase);
      if (!['http:', 'https:'].includes(setupUrl.protocol)) {
        throw new Error('Setup URL must use HTTP or HTTPS');
      }
      setupUrl.searchParams.set('token', token);
      stage = 'Gmail delivery';
      await sendAccountSetupLink(user.email, user.username, setupUrl.toString());

      stage = 'finalizing setup link expiry';
      const { rows: finalizedToken } = await query(
        `UPDATE users
         SET password_setup_expires_at = NOW() + INTERVAL '30 minutes'
         WHERE id = $1
           AND password_setup_token_hash = $2
           AND credential_setup_required = TRUE
           AND is_active = TRUE
         RETURNING id`,
        [user.id, tokenHash]
      );
      if (!finalizedToken[0]) {
        throw new Error('Password setup link was replaced before delivery completed');
      }

      stage = 'audit logging';
      await log({
        userId: user.id,
        actorId: req.user.id,
        action: 'USER_SETUP_LINK_SENT',
        ipAddress: getIp(req),
        details: { username: user.username, role: user.role },
      });
      res.json({ message: `Password setup email sent to ${user.email}` });
    } catch (err) {
      console.error(`[USERS] Send setup link failed during ${stage} (${err.code || 'NO_CODE'}):`, err.message);
      res.status(500).json({ message: getSetupLinkErrorMessage(err, stage) });
    }
  }
);

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
// Admins can delete Inputers and Administrators. Administrators can delete any account.
router.delete(
  '/:id',
  authorizeRole(['admin', 'administrator']),
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    try {
      const { rows } = await query(
        'SELECT id, username, role FROM users WHERE id = $1',
        [req.params.id]
      );
      const target = rows[0];
      if (!target) return res.status(404).json({ message: 'User not found' });

      if (
        req.user.role === 'admin' &&
        !['inputer', 'administrator'].includes(target.role)
      ) {
        return res.status(403).json({
          message: 'Admins may only delete Inputer or Administrator accounts',
        });
      }

      await query('DELETE FROM users WHERE id = $1', [req.params.id]);

      await log({
        userId:    target.id,
        actorId:   req.user.id,
        action:    AuditAction.USER_DELETED,
        ipAddress: getIp(req),
        details:   { deletedUser: target.username, deletedRole: target.role, deletedBy: req.user.username },
      });

      res.json({ message: `User '${target.username}' deleted successfully` });
    } catch (err) {
      console.error('[USERS] DELETE /:id error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── PATCH /api/users/:id/role ────────────────────────────────────────────────
// Only Administrator can change roles
router.patch(
  '/:id/role',
  authorizeRole(['administrator']),
  [
    param('id').isUUID(),
    body('role').isIn(VALID_ROLES).withMessage(`Role must be one of: ${VALID_ROLES.join(', ')}`),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot change your own role' });
    }

    try {
      const { rows } = await query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
        [req.body.role, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ message: 'User not found' });

      await log({
        userId:    rows[0].id,
        actorId:   req.user.id,
        action:    AuditAction.USER_ROLE_CHANGED,
        ipAddress: getIp(req),
        details:   { username: rows[0].username, newRole: rows[0].role, changedBy: req.user.username },
      });

      res.json(rows[0]);
    } catch (err) {
      console.error('[USERS] PATCH /:id/role error:', err.message);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── GET /api/users/audit-logs ────────────────────────────────────────────────
// Administrators only — view all audit events
router.get(
  '/logs/audit',
  authorizeRole(['administrator']),
  async (req, res) => {
    try {
      const limit  = Math.min(200, parseInt(req.query.limit  || '50', 10));
      const offset = Math.max(0,   parseInt(req.query.offset || '0',  10));

      const { rows } = await query(
        `SELECT al.*, u.username AS subject_username, a.username AS actor_username
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id  = u.id
         LEFT JOIN users a ON al.actor_id = a.id
         ORDER BY al.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;
