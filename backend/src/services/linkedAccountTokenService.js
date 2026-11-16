// src/services/linkedAccountTokenService.js
// AES-256-GCM envelope for OAuth access/refresh tokens at rest.
// Reuses BACKUP_ENCRYPTION_KEY (32 bytes) — same trust boundary as cloud backups.
'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey() {
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext token. Returns "v1.<iv>.<tag>.<ciphertext>" (all base64url except version).
 */
function encryptToken(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Cannot encrypt an empty token.');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64u = (buf) => buf.toString('base64url');
  return `v1.${b64u(iv)}.${b64u(tag)}.${b64u(ciphertext)}`;
}

/**
 * Decrypt a value produced by encryptToken. Throws on tamper/version mismatch.
 */
function decryptToken(envelope) {
  const key = getKey();
  const parts = String(envelope || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported linked-account token envelope.');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Malformed linked-account token envelope.');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptToken, decryptToken };
