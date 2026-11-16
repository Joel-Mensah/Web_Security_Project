// src/routes/linkedAccountsConnect.js — part 2: initiate + complete provider connection
'use strict';

const crypto = require('crypto');
const { body, param } = require('express-validator');
const { query } = require('../config/db');
const { log, AuditAction } = require('../services/auditService');
const { encryptToken } = require('../services/linkedAccountTokenService');
const { PROVIDER_META, publicAccount, getIp, validationError } = require('./linkedAccounts');

function registerConnect(router) {
  router.post(
    '/me/linked-accounts/connect/:provider',
    [
      param('provider').isIn(Object.keys(PROVIDER_META)),
      body('code').optional().isString().isLength({ min: 1, max: 4096 }),
      body('providerAccountId').optional().isString().isLength({ min: 1, max: 255 }),
      body('providerEmail').optional().isEmail().normalizeEmail(),
      body('accessToken').optional().isString().isLength({ min: 8, max: 8192 }),
      body('refreshToken').optional().isString().isLength({ min: 8, max: 8192 }),
      body('displayName').optional().isString().isLength({ max: 255 }),
      body('avatarUrl').optional().isString().isLength({ max: 2048 }),
      body('scopes').optional().isArray({ max: 50 }),
    ],
    async (req, res) => {
      if (validationError(req, res)) return;
      const { provider } = req.params;
      try {
        if (!req.body.code && !req.body.accessToken) {
          const state = crypto.randomBytes(24).toString('hex');
          await log({
            userId: req.user.id, actorId: req.user.id,
            action: AuditAction.ACCOUNT_LINK_INITIATED,
            ipAddress: getIp(req), details: { provider, state: state.slice(0, 12) },
          });
          return res.json({
            provider, connectUrl: PROVIDER_META[provider].connectUrl, state,
            message: provider === 'custom_saml'
              ? 'Ask your administrator for the SSO sign-on URL, then paste the returned code below.'
              : 'Open the provider authorize URL with this state, then POST the returned code back here.',
          });
        }

        const providerAccountId = req.body.providerAccountId || `pending-${crypto.randomUUID()}`;
        const accessToken = req.body.accessToken || `code-exchange:${req.body.code || 'manual'}`;
        const metadata = {
          displayName: req.body.displayName || null,
          avatarUrl: req.body.avatarUrl || null,
          scopes: Array.isArray(req.body.scopes) ? req.body.scopes.slice(0, 50) : [],
          connectedVia: req.body.code ? 'oauth-code' : 'manual-token',
        };

        let accessTokenEncrypted;
        let refreshTokenEncrypted = null;
        try {
          accessTokenEncrypted = encryptToken(accessToken);
          if (req.body.refreshToken) refreshTokenEncrypted = encryptToken(req.body.refreshToken);
        } catch (err) {
          return res.status(503).json({ message: err.message });
        }

        const { rows } = await query(
          `INSERT INTO user_linked_accounts
             (user_id, provider, provider_account_id, provider_email,
              access_token_encrypted, refresh_token_encrypted, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (provider, provider_account_id) DO UPDATE SET
             user_id = EXCLUDED.user_id, provider_email = EXCLUDED.provider_email,
             access_token_encrypted = EXCLUDED.access_token_encrypted,
             refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
             metadata = EXCLUDED.metadata, updated_at = NOW()
           RETURNING id, provider, provider_account_id, provider_email, metadata, created_at, updated_at`,
          [req.user.id, provider, providerAccountId, req.body.providerEmail || null,
           accessTokenEncrypted, refreshTokenEncrypted, JSON.stringify(metadata)]
        );

        await query(
          `DELETE FROM user_linked_accounts WHERE user_id = $1 AND provider = $2 AND id <> $3`,
          [req.user.id, provider, rows[0].id]
        );

        await log({
          userId: req.user.id, actorId: req.user.id,
          action: AuditAction.ACCOUNT_LINKED,
          ipAddress: getIp(req),
          details: { provider, accountId: rows[0].id, email: req.body.providerEmail || null },
        });

        res.status(201).json({ account: publicAccount(rows[0]) });
      } catch (err) {
        console.error('[LINKED] connect failed:', err.message);
        res.status(500).json({ message: 'Could not connect this account.' });
      }
    }
  );
}

module.exports = { registerConnect };
