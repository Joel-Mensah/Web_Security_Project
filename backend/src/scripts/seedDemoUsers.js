'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const crypto = require('crypto');
const readline = require('readline-sync');
const fs = require('fs');
const { query, pool } = require('../config/db');
const { generateSalt, hashPassword } = require('../services/cryptoService');

const DEMO_ROLES = ['inputer', 'manager', 'admin', 'administrator'];
const CONFIRMATION = 'ADD DEMO USERS';

async function main() {
  const skipArguments = process.argv.slice(2);
  const useJsonInput = skipArguments.includes('--input-json');
  const skippedRoles = new Set(
    skipArguments
      .filter((argument) => argument.startsWith('--skip='))
      .flatMap((argument) => argument.slice('--skip='.length).split(','))
  );
  const unknownArguments = skipArguments.filter(
    (argument) => argument !== '--input-json' && !argument.startsWith('--skip=')
  );
  const unknownRoles = [...skippedRoles].filter((role) => !DEMO_ROLES.includes(role));
  if (unknownArguments.length || unknownRoles.length) {
    throw new Error(`Invalid demo seed options: ${[...unknownArguments, ...unknownRoles].join(', ')}`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo accounts cannot be added when NODE_ENV is production.');
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_DEMO_SEED=true for this command, then run it again.');
  }

  const databaseUrl = new URL(process.env.SUPABASE_DATABASE_URL);
  console.log(`\nThis will add sample accounts to database host: ${databaseUrl.hostname}`);
  console.log('Each account gets a random undisclosed password and must set its own password by email.');
  console.log('Do not continue if this is a production database.\n');

  let accountsByRole = null;
  let confirmation;
  if (useJsonInput) {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    confirmation = input.confirmation;
    if (!Array.isArray(input.accounts)) {
      throw new Error('JSON input must include an accounts array.');
    }
    accountsByRole = new Map();
    for (const account of input.accounts) {
      if (!DEMO_ROLES.includes(account.role) || skippedRoles.has(account.role)) {
        throw new Error(`Invalid or skipped role in JSON input: ${account.role}`);
      }
      if (accountsByRole.has(account.role)) {
        throw new Error(`Duplicate account role in JSON input: ${account.role}`);
      }
      const username = typeof account.username === 'string' ? account.username.trim().toLowerCase() : '';
      const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : '';
      if (!/^[a-zA-Z0-9_]{3,64}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(`Invalid username or email for ${account.role}.`);
      }
      accountsByRole.set(account.role, { username, email });
    }
    for (const role of DEMO_ROLES) {
      if (!skippedRoles.has(role) && !accountsByRole.has(role)) {
        throw new Error(`JSON input is missing the ${role} account.`);
      }
    }
  } else {
    confirmation = readline.question(`Type "${CONFIRMATION}" to continue: `);
  }
  if (confirmation !== CONFIRMATION) {
    console.log('No sample accounts were created.');
    return;
  }

  let created = 0;
  let skipped = 0;
  for (const role of DEMO_ROLES) {
    if (skippedRoles.has(role)) {
      console.log(`Skipped ${role} account at your request.`);
      skipped += 1;
      continue;
    }
    const account = accountsByRole?.get(role);
    const username = account?.username || readline.question(`Username for ${role} [sample_${role}]: `)
      .trim()
      .toLowerCase() || `sample_${role}`;
    const email = account?.email || readline.questionEMail(`Email for ${username}: `).trim().toLowerCase();
    const { rows: existing } = await query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1',
      [username, email]
    );
    if (existing.length) {
      console.log(`Skipped ${username}: that username or email already exists.`);
      skipped += 1;
      continue;
    }

    const randomPassword = crypto.randomBytes(32).toString('base64url');
    const salt = generateSalt();
    const passwordHash = await hashPassword(randomPassword, salt);
    await query(
      `INSERT INTO users (
         username, email, password_hash, salt, role, credential_setup_required
       )
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [username, email, passwordHash, salt, role]
    );
    console.log(`Created ${username} (${role}). Send a password setup link from User Management.`);
    created += 1;
  }

  console.log(`\nFinished. Created ${created} account(s), skipped ${skipped} account(s).`);
}

main()
  .catch((err) => {
    console.error('[DEMO SEED] Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
