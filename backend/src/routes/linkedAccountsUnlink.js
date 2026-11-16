// src/routes/linkedAccountsUnlink.js — part 3: disconnect with last-method re-auth gate
'use strict';

const { body, param } = require('express-validator');
const { query } = require('../config/db');
const { log, AuditAction } = require('../services/auditService');
const { PROVIDER_META, getIp, validationError } = require('./linkedAccounts');

function registerUnlink(router) {
  router.delete(
    '/me/linked-accounts/:id',
    [param('id').isUUID(), body('confirmLastMethod').optional().isBoolean()],
    async (req, res) => {
      if (validationError(req, res)) return;
      try {
        const { rows } = await query(
          'SELECT id, provider, provider_email FROM user_linked_accounts WHERE id = $1 AND user_id = $2',
          [req.params.id, req.user.id]
        );
        const target = rows[0];
        if (!target) return res.status(404).json({ message: 'Linked account not found.' });

        const { rows: siblings } = await query(
          'SELECT COUNT(*)::int AS n FROM user_linked_accounts WHERE user_id = $1 AND id <> $2',
          [req.user.id, req.params.id]
        );
        const { rows: me } = await query(
          'SELECT credential_setup_required, mfa_enabled, password_hash FROM users WHERE id = $1',
          [req.user.id]
        );
        const hasPassword = me[0] && !me[0].credential_setup_required && !!me[0].password_hash;
        const hasMfa = !!(me[0] && me[0].mfa_enabled);
        const isLastMethod = siblings[0].n === 0 && !hasPassword && !hasMfa;

        if (isLastMethod && req.body.confirmLastMethod !== true) {
          return res.status(409).json({
            message: 'This is your last sign-in method. Re-authenticate (fresh 2FA), then retry with confirmLastMethod: true.',
            requiresReauth: true,
          });
        }

        await query('DELETE FROM user_linked_accounts WHERE id = $1 AND user_id = $2',
          [req.params.id, req.user.id]);
        await log({
          userId: req.user.id, actorId: req.user.id,
          action: AuditAction.ACCOUNT_UNLINKED,
          ipAddress: getIp(req),
          details: { provider: target.provider, accountId: target.id, email: target.provider_email },
        });
        res.json({ message: `${PROVIDER_META[target.provider]?.name || target.provider} disconnected.` });
      } catch (err) {
        console.error('[LINKED] unlink failed:', err.message);
        res.status(500).json({ message: 'Could not disconnect this account.' });
      }
    }
  );
}

module.exports = { registerUnlink };
