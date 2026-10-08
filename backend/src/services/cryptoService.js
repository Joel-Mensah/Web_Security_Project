// src/services/cryptoService.js
// Salt + Pepper + Argon2id password hashing pipeline
'use strict';

const argon2  = require('argon2');
const crypto  = require('crypto');

// Argon2id tuning — OWASP recommended minimums for interactive logins
const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  65536,   // 64 MiB
  timeCost:    3,       // 3 iterations
  parallelism: 4,
};

/**
 * Generate a cryptographically secure 16-byte random salt.
 * @returns {string} Hex-encoded salt (32 chars)
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Build the pepper-augmented password string.
 * Pepper is concatenated with the plaintext before hashing so it's
 * never stored in the DB — only lives in process.env.SECRET_PEPPER.
 *
 * @param {string} password - Plaintext password
 * @param {string} salt     - Hex salt for this user
 * @returns {string}
 */
function buildInput(password, salt) {
  const pepper = process.env.SECRET_PEPPER;
  if (!pepper) {
    throw new Error('SECRET_PEPPER environment variable is not set');
  }
  // Combine: password || pepper || salt  (order is fixed and documented)
  return `${password}:${pepper}:${salt}`;
}

/**
 * Hash a plaintext password using Salt + Pepper + Argon2id.
 *
 * @param {string} password  - Plaintext password from the user
 * @param {string} salt      - Pre-generated hex salt for this user
 * @returns {Promise<string>} Argon2id encoded hash string
 */
async function hashPassword(password, salt) {
  const input = buildInput(password, salt);
  return argon2.hash(input, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against the stored Argon2id hash.
 *
 * @param {string} password     - Plaintext password to verify
 * @param {string} salt         - Stored hex salt for this user
 * @param {string} storedHash   - Stored Argon2id hash from the DB
 * @returns {Promise<boolean>}  True if password matches
 */
async function verifyPassword(password, salt, storedHash) {
  const input = buildInput(password, salt);
  return argon2.verify(storedHash, input);
}

module.exports = { generateSalt, hashPassword, verifyPassword };
