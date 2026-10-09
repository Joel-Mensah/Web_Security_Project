// src/services/auditService.js
// Write security-relevant events to the audit_logs table
'use strict';

const { query } = require('../config/db');

/**
 * Log a security event to the audit_logs table.
 *
 * @param {object} opts
 * @param {string|null} opts.userId    - The user the event is ABOUT (can be null for unknown logins)
 * @param {string|null} opts.actorId   - The user PERFORMING the action (null = system/unauthenticated)
 * @param {string}      opts.action    - Machine-readable event label (e.g. 'LOGIN_SUCCESS')
 * @param {string|null} opts.ipAddress - Remote IP address
 * @param {object}      [opts.details] - Arbitrary JSON details
 */
async function log({ userId, actorId, action, ipAddress, details = {} }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, actor_id, action, ip_address, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, actorId || null, action, ipAddress || null, JSON.stringify(details)]
    );
  } catch (err) {
    // Audit failures must NEVER crash the main request
    console.error('[AUDIT] Failed to write audit log:', err.message, { action, userId });
  }
}

// ── Convenience wrappers ───────────────────────────────────────────────────

const AuditAction = {
  LOGIN_ATTEMPT:     'LOGIN_ATTEMPT',
  LOGIN_SUCCESS:     'LOGIN_SUCCESS',
  LOGIN_FAILURE:     'LOGIN_FAILURE',
  LOGIN_2FA_SUCCESS: 'LOGIN_2FA_SUCCESS',
  LOGIN_2FA_FAILURE: 'LOGIN_2FA_FAILURE',
  EMAIL_OTP_SENT:    'EMAIL_OTP_SENT',
  EMAIL_OTP_SUCCESS: 'EMAIL_OTP_SUCCESS',
  EMAIL_OTP_FAILURE: 'EMAIL_OTP_FAILURE',
  LOGOUT:            'LOGOUT',
  MFA_SETUP:         'MFA_SETUP',
  USER_CREATED:      'USER_CREATED',
  USER_SETUP_LINK_SENT: 'USER_SETUP_LINK_SENT',
  USER_PASSWORD_SETUP_COMPLETED: 'USER_PASSWORD_SETUP_COMPLETED',
  USER_DELETED:      'USER_DELETED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  UNAUTHORIZED:      'UNAUTHORIZED_ACCESS',
};

module.exports = { log, AuditAction };
