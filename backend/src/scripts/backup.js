// Encrypted automated local PostgreSQL backup to disk and Google Drive
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const cron = require('node-cron');

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || './backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const ENC_KEY_HEX = process.env.BACKUP_ENCRYPTION_KEY || '';
const CRON_SCHEDULE = process.env.BACKUP_CRON || '0 0 * * *';
const PG_DUMP = process.env.PG_DUMP_PATH || 'pg_dump';
const DRIVE_SYNC_DIR = path.resolve(process.env.GOOGLE_DRIVE_SYNC_DIR || '');

function validateConfig() {
  if (!/^[a-fA-F0-9]{64}$/.test(ENC_KEY_HEX)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  if (!process.env.LOCAL_DATABASE_URL) {
    throw new Error('LOCAL_DATABASE_URL must point to the local PostgreSQL database');
  }
  let databaseUrl;
  try {
    databaseUrl = new URL(process.env.LOCAL_DATABASE_URL);
  } catch {
    throw new Error('LOCAL_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('LOCAL_DATABASE_URL must use the postgres:// or postgresql:// scheme');
  }
  if (!databaseUrl.hostname || !decodeURIComponent(databaseUrl.pathname.slice(1))) {
    throw new Error('LOCAL_DATABASE_URL must include a PostgreSQL host and database name');
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(databaseUrl.hostname)) {
    throw new Error('LOCAL_DATABASE_URL must connect to PostgreSQL on this computer');
  }
  if (!process.env.LOCAL_DATABASE_PASSWORD && !databaseUrl.password) {
    throw new Error('Set LOCAL_DATABASE_PASSWORD in backend/.env for pg_dump authentication');
  }
  if (!process.env.GOOGLE_DRIVE_SYNC_DIR || !path.isAbsolute(process.env.GOOGLE_DRIVE_SYNC_DIR)) {
    throw new Error('GOOGLE_DRIVE_SYNC_DIR must be an absolute Google Drive for desktop sync-folder path');
  }
  if (!fs.existsSync(DRIVE_SYNC_DIR) || !fs.statSync(DRIVE_SYNC_DIR).isDirectory()) {
    throw new Error('GOOGLE_DRIVE_SYNC_DIR must point to an existing Google Drive for desktop folder');
  }
  if (path.resolve(BACKUP_DIR).toLowerCase() === DRIVE_SYNC_DIR.toLowerCase()) {
    throw new Error('BACKUP_DIR and GOOGLE_DRIVE_SYNC_DIR must be different folders');
  }
  if (!Number.isInteger(RETENTION_DAYS) || RETENTION_DAYS < 1) {
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer');
  }
  return databaseUrl;
}

function copyBackupToDriveFolder(filePath, filename) {
  const driveCopy = path.join(DRIVE_SYNC_DIR, filename);
  fs.copyFileSync(filePath, driveCopy, fs.constants.COPYFILE_EXCL);
  const sourceSize = fs.statSync(filePath).size;
  const copySize = fs.statSync(driveCopy).size;
  if (sourceSize !== copySize) {
    throw new Error('Google Drive sync-folder copy size does not match the local backup');
  }
  return driveCopy;
}

function pgDumpEnvironment(databaseUrl) {
  const host = databaseUrl.hostname.replace(/^\[|\]$/g, '');
  return {
    ...process.env,
    PGHOST: host || 'localhost',
    PGPORT: databaseUrl.port || '5432',
    PGUSER: decodeURIComponent(databaseUrl.username),
    PGPASSWORD: process.env.LOCAL_DATABASE_PASSWORD || decodeURIComponent(databaseUrl.password),
    PGDATABASE: decodeURIComponent(databaseUrl.pathname.slice(1)),
    PGSSLMODE: 'disable',
  };
}

async function runBackup() {
  const databaseUrl = validateConfig();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql.enc`;
  const outputFile = path.join(BACKUP_DIR, filename);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY_HEX, 'hex'), iv);
  let localBackupComplete = false;

  console.log(`[BACKUP] Starting encrypted PostgreSQL backup: ${filename}`);

  const pgDump = spawn(PG_DUMP, [
    '--no-password',
    '--format=plain',
    '--no-owner',
    '--no-acl',
    '--dbname',
    decodeURIComponent(databaseUrl.pathname.slice(1)),
  ], { env: pgDumpEnvironment(databaseUrl), stdio: ['ignore', 'pipe', 'pipe'] });

  const dumpExit = new Promise((resolve, reject) => {
    pgDump.once('error', reject);
    pgDump.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed (exit code ${code}, signal ${signal || 'none'})`));
    });
  });

  pgDump.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) console.warn(`[BACKUP] pg_dump: ${message}`);
  });

  try {
    const outFile = fs.createWriteStream(outputFile, { flags: 'wx' });
    outFile.write(iv);
    await pipeline(pgDump.stdout, cipher, outFile);
    await dumpExit;
    fs.appendFileSync(outputFile, cipher.getAuthTag());
    localBackupComplete = true;

    copyBackupToDriveFolder(outputFile, filename);
    const sizeKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
    console.log(
      `[BACKUP] Encrypted backup saved locally and copied to the Google Drive sync folder (${sizeKB} KB).`
    );
    return outputFile;
  } catch (err) {
    if (pgDump.exitCode === null && !pgDump.killed) pgDump.kill();
    if (!localBackupComplete) {
      try {
        fs.rmSync(outputFile, { force: true });
      } catch (cleanupError) {
        console.error('[BACKUP] Could not remove incomplete local backup:', cleanupError.message);
      }
    }
    throw err;
  }
}

async function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  validateConfig();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const directory of [BACKUP_DIR, DRIVE_SYNC_DIR]) {
    const files = fs.readdirSync(directory).filter((file) => /^backup-.+\.sql\.enc$/.test(file));
    for (const file of files) {
      const fullPath = path.join(directory, file);
      if (fs.statSync(fullPath).mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
        console.log(`[BACKUP] Pruned expired backup from ${directory}: ${file}`);
      }
    }
  }
}

function startBackupCron() {
  validateConfig();
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Invalid BACKUP_CRON schedule: ${CRON_SCHEDULE}`);
  }
  cron.schedule(CRON_SCHEDULE, async () => {
    try {
      await runBackup();
      await pruneOldBackups();
    } catch (err) {
      console.error('[BACKUP] Cron error:', err.message);
    }
  });
  console.log(`[BACKUP] Google Drive for desktop backup cron scheduled: "${CRON_SCHEDULE}"`);
}

if (require.main === module) {
  (async () => {
    try {
      if (process.argv.includes('--now')) {
        await runBackup();
        await pruneOldBackups();
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

module.exports = { startBackupCron, runBackup, pruneOldBackups, validateConfig };
