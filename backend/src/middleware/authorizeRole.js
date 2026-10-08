// src/middleware/authorizeRole.js
// Factory that returns role-enforcement middleware for RBAC
'use strict';

const { log, AuditAction } = require('../services/auditService');

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

    if (!normalized.includes(req.user.role.toLowerCase())) {
      await log({
        userId:    req.user.id,
        actorId:   req.user.id,
        action:    AuditAction.UNAUTHORIZED,
        ipAddress: req.ip,
        details:   {
          requiredRoles: normalized,
          userRole:      req.user.role,
          path:          req.originalUrl,
          method:        req.method,
        },
      });
      return res.status(403).json({
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

module.exports = authorizeRole;
