// src/middleware/authorizeRole.js
// Factory that returns role-enforcement middleware for RBAC
'use strict';

const { log, AuditAction } = require('../services/auditService');
const { query } = require('../config/db');

/**
 * RBAC middleware factory.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, authorizeRole(['admin', 'administrator']), handler)
 *
 * @param {string[]} allowedRoles - Lowercase role strings that may access the route
 * @returns {import('express').RequestHandler}
 */
function authorizeRole(allowedRoles) {
  const normalized = allowedRoles.map(r => r.toLowerCase());

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    try {
      const { rows } = await query(
        'SELECT role, is_active FROM users WHERE id = $1',
        [req.user.id]
      );
      const account = rows[0];
      if (!account || !account.is_active) {
        return res.status(403).json({ message: 'This account is unavailable or inactive' });
      }

      req.user.role = account.role;
      if (!normalized.includes(account.role.toLowerCase())) {
        await log({
          userId:    req.user.id,
          actorId:   req.user.id,
          action:    AuditAction.UNAUTHORIZED,
          ipAddress: req.ip,
          details:   {
            requiredRoles: normalized,
            userRole:      account.role,
            path:          req.originalUrl,
            method:        req.method,
          },
        });
        return res.status(403).json({
          message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (err) {
      console.error('[AUTHZ] Could not verify current account role:', err.message);
      return res.status(500).json({ message: 'Could not verify account permissions' });
    }
  };
}

module.exports = authorizeRole;
