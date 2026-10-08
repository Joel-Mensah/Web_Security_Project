// src/scripts/backup.js
// Encrypted automated PostgreSQL backup via pg_dump + AES-256-CBC + node-cron
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { execSync, spawn } = require('child_process');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const cron    = require('node-cron');

// ─── Config ───────────────────────────────────────────────────────────────────
const BACKUP_DIR      = path.resolve(process.env.BACKUP_DIR || './backups');
const RETENTION_DAYS  = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const ENC_KEY_HEX     = process.env.BACKUP_ENCRYPTION_KEY || '';
const CRON_SCHEDULE   = process.env.BACKUP_CRON || '0 0 * * *';
const PG_DUMP         = process.env.PG_DUMP_PATH || 'pg_dump';

// ─── Validate ─────────────────────────────────────────────────────────────────
function validateConfig() {
  if (!ENC_KEY_HEX || ENC_KEY_HEX.length !== 64) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  if (!process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error('DB_NAME and DB_USER must be set in .env');
  }
}

// ─── Run a single backup ──────────────────────────────────────────────────────
async function runBackup() {
  validateConfig();

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(BACKUP_DIR, `backup-${timestamp}.sql.enc`);

  const encKey = Buffer.from(ENC_KEY_HEX, 'hex');
  const iv     = crypto.randomBytes(16);          // Fresh IV per backup

  console.log(`[BACKUP] Starting encrypted backup → ${outputFile}`);

  return new Promise((resolve, reject) => {
    const pgEnv = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD,
    };

    const pgDump = spawn(PG_DUMP, [
      '--host',     process.env.DB_HOST || 'localhost',
      '--port',     process.env.DB_PORT || '5432',
      '--username', process.env.DB_USER,
      '--no-password',
      '--format',   'plain',
      process.env.DB_NAME,
    ], { env: pgEnv });

    const cipher  = crypto.createCipheriv('aes-256-cbc', encKey, iv);
    const outFile = fs.createWriteStream(outputFile);

    // Prepend the IV to the file so decryption can read it
    outFile.write(iv);

    pgDump.stdout.pipe(cipher).pipe(outFile);

    pgDump.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.warn(`[BACKUP] pg_dump stderr: ${msg}`);
    });

    outFile.on('finish', () => {
      const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
      console.log(`[BACKUP] ✅ Backup complete: ${outputFile} (${sizeKB} KB)`);
      resolve(outputFile);
    });

    pgDump.on('error', reject);
    cipher.on('error', reject);
    outFile.on('error', reject);
  });
}

// ─── Prune old backups ────────────────────────────────────────────────────────
function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files  = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql.enc'));
  let pruned   = 0;
  for (const f of files) {
    const full  = path.join(BACKUP_DIR, f);
    const mtime = fs.statSync(full).mtimeMs;
    if (mtime < cutoff) {
      fs.unlinkSync(full);
      pruned++;
      console.log(`[BACKUP] Pruned old backup: ${f}`);
    }
  }
  if (pruned === 0) console.log('[BACKUP] No old backups to prune.');
}

// ─── Schedule / CLI ───────────────────────────────────────────────────────────

/**
 * Start the scheduled backup cron. Called from server.js.
 */
function startBackupCron() {
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await runBackup();
      pruneOldBackups();
    } catch (err) {
      console.error('[BACKUP] Cron error:', err.message);
    }
  });
  console.log(`[BACKUP] Cron scheduled: "${CRON_SCHEDULE}"`);
}

// Allow manual trigger: node backup.js --now
if (require.main === module) {
  (async () => {
    try {
      if (process.argv.includes('--now')) {
        await runBackup();
        pruneOldBackups();
      } else {
        startBackupCron();
        console.log('[BACKUP] Running in cron mode. Press Ctrl+C to exit.');
      }
    } catch (err) {
      console.error('[BACKUP] Fatal:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { startBackupCron, runBackup };

// ─── DECRYPT HELPER (instructions only — do not expose as API) ─────────────────
/*
  To decrypt a backup manually:
  
  const encKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
  const fileBuffer = fs.readFileSync('backup-<ts>.sql.enc');
  const iv = fileBuffer.slice(0, 16);
  const encrypted = fileBuffer.slice(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  fs.writeFileSync('restored.sql', decrypted);
*/
