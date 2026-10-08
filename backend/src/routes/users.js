// src/routes/users.js
// User CRUD with RBAC enforcement
'use strict';

const express  = require('express');
const { body, param, validationResult } = require('express-validator');

const { query }             = require('../config/db');
const { generateSalt, hashPassword } = require('../services/cryptoService');
const { log, AuditAction }  = require('../services/auditService');
const authenticate          = require('../middleware/authenticate');
const authorizeRole         = require('../middleware/authorizeRole');

const router = express.Router();

// All user routes require a valid JWT
router.use(authenticate);

const VALID_ROLES = ['inputer', 'manager', 'admin', 'administrator'];

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
        `SELECT id, username, email, role, mfa_enabled, is_active, last_login_at, created_at
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
    body('password').isLength({ min: 10 }).withMessage('Password must be at least 10 characters'),
    body('role').optional().isIn(VALID_ROLES),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email, password } = req.body;
    let   { role = 'inputer' } = req.body;

    // Managers can only create inputer accounts
    if (req.user.role === 'manager' && role !== 'inputer') {
      return res.status(403).json({ message: 'Managers may only create Inputer accounts' });
    }

    try {
      const salt = generateSalt();
      const hash = await hashPassword(password, salt);

      const { rows } = await query(
        `INSERT INTO users (username, email, password_hash, salt, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, role, created_at`,
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

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
// Only Admin and Administrator can delete Inputers
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

      // Admins (non-administrator) can only delete inputer accounts
      if (req.user.role === 'admin' && target.role !== 'inputer') {
        return res.status(403).json({ message: 'Admins may only delete Inputer accounts' });
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
