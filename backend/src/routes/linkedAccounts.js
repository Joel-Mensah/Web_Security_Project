// src/routes/linkedAccounts.js — part 1: setup, list, helpers
// Integration Center ("Link This Site"). Tokens AES-256-GCM encrypted; never returned.
'use strict';

const express = require('express');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');

const { query } = require('../config/db');
const authenticate = require('../middleware/authenticate');
const { log, AuditAction } = require('../services/auditService');
const { encryptToken } = require('../services/linkedAccountTokenService');

const router = express.Router();
router.use(authenticate);

const PROVIDERS = ['google', 'github', 'microsoft', 'slack', 'custom_saml'];
const PROVIDER_META = {
  google:      { name: 'Google',         connectUrl: 'https://accounts.google.com/o/oauth2/v2/auth' },
  github:      { name: 'GitHub',         connectUrl: 'https://github.com/login/oauth/authorize' },
  microsoft:   { name: 'Microsoft 365',  connectUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' },
  slack:       { name: 'Slack',          connectUrl: 'https://slack.com/oauth/v2/authorize' },
  custom_saml: { name: 'Enterprise SSO', connectUrl: '' },
};

function getIp(req) {
  if (!req || !req.headers) return req?.ip || 'unknown';
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function validationError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ errors: errors.array() });
  return true;
}

function publicAccount(row) {
  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerEmail: row.provider_email,
    displayName: row.metadata?.displayName || row.metadata?.display_name || null,
    avatarUrl: row.metadata?.avatarUrl || row.metadata?.avatar_url || null,
    scopes: row.metadata?.scopes || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/users/me/linked-accounts — list caller's accounts (tokens redacted)
router.get('/me/linked-accounts', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, provider, provider_account_id, provider_email, metadata, created_at, updated_at
       FROM user_linked_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.user.id]
    );
    res.json({ accounts: rows.map(publicAccount), providers: PROVIDER_META });
  } catch (err) {
    console.error('[LINKED] list failed:', err.message);
    res.status(500).json({ message: 'Could not load linked accounts.' });
  }
});

module.exports = { router, PROVIDERS, PROVIDER_META, publicAccount, getIp, validationError };
