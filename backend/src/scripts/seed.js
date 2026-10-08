// src/scripts/seed.js
// One-time CLI script to bootstrap the first Administrator account
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const readline     = require('readline-sync');
const { query, pool } = require('../config/db');
const { generateSalt, hashPassword } = require('../services/cryptoService');

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Enterprise Auth — Administrator Seed   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Check if an administrator already exists
  const { rows: existing } = await query(
    "SELECT COUNT(*) FROM users WHERE role = 'administrator'"
  );
  if (parseInt(existing[0].count, 10) > 0) {
    console.log('⚠️  An Administrator account already exists. Exiting.');
    await pool.end();
    return;
  }

  console.log('No Administrator found. Creating one now.\n');

  const username = readline.question('Username: ').trim().toLowerCase();
  if (!username || username.length < 3) {
    console.error('Username must be at least 3 characters.'); process.exit(1);
  }

  const email = readline.questionEMail('Email: ');

  const password = readline.question('Password (min 10 chars, hidden): ', { hideEchoBack: true });
  if (password.length < 10) {
    console.error('Password too short.'); process.exit(1);
  }

  const confirm = readline.question('Confirm password: ', { hideEchoBack: true });
  if (password !== confirm) {
    console.error('Passwords do not match.'); process.exit(1);
  }

  const salt = generateSalt();
  const hash = await hashPassword(password, salt);

  const { rows } = await query(
    `INSERT INTO users (username, email, password_hash, salt, role)
     VALUES ($1, $2, $3, $4, 'administrator')
     RETURNING id, username, email, role, created_at`,
    [username, email, hash, salt]
  );

  console.log('\n✅ Administrator account created successfully:');
  console.table(rows[0]);
  console.log('\n⚠️  IMPORTANT: Set up 2FA on first login.\n');

  await pool.end();
}

main().catch(err => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
