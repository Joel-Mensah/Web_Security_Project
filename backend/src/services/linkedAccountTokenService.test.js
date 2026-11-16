// src/services/linkedAccountTokenService.test.js
'use strict';

const crypto = require('crypto');

describe('linkedAccountTokenService', () => {
  const OLD = process.env.BACKUP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    jest.resetModules();
  });

  afterAll(() => {
    process.env.BACKUP_ENCRYPTION_KEY = OLD;
  });

  test('encrypt/decrypt round-trips and rejects tampering', () => {
    const { encryptToken, decryptToken } = require('./linkedAccountTokenService');
    const envelope = encryptToken('oauth-access-123');
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(envelope).not.toContain('oauth-access-123');
    expect(decryptToken(envelope)).toBe('oauth-access-123');
    expect(() => decryptToken(`${envelope}x`)).toThrow();
  });

  test('refuses to run without a 32-byte key', () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    const { encryptToken } = require('./linkedAccountTokenService');
    expect(() => encryptToken('x')).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });
});
