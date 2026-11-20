'use strict';

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getClient } = require('../config/db');

const BACKUP_TABLES = [
  'users',
  'password_reset_codes',
  'audit_logs',
  'incidents',
  'incident_updates',
  'user_linked_accounts',
];
const REQUIRED_BACKUP_TABLES = BACKUP_TABLES.filter((table) => table !== 'user_linked_accounts');
const DEFAULT_BUCKET = 'enterprise-auth-backups';
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const SUPABASE_URL_HINT = 'Set SUPABASE_URL to the Supabase project URL from Project Settings > API, not a Vercel deployment URL.';
const SERVICE_ROLE_KEY_HINT = 'For Storage, set SUPABASE_SECRET_KEY to the backend secret key (sb_secret_...) and SUPABASE_SERVICE_ROLE_KEY to the legacy service_role JWT. The JWT is required for the Authorization header. Do not use the anon/publishable key.';

function isHtmlResponseError(error) {
  const message = error?.message || String(error);
  return /<!doctype\s+html/i.test(message) || /Unexpected token\s+['"`]?</i.test(message);
}

function getBackupConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  const legacyServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const serviceRoleKey = secretKey || legacyServiceRoleKey;
  const bucket = process.env.SUPABASE_BACKUP_BUCKET || DEFAULT_BUCKET;
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for private Supabase backups.');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL.');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('SUPABASE_URL must use HTTPS.');
  }
  if (parsedUrl.hostname === 'vercel.app' || parsedUrl.hostname.endsWith('.vercel.app')) {
    throw new Error(`SUPABASE_URL points to a Vercel deployment. ${SUPABASE_URL_HINT}`);
  }
  if (parsedUrl.hostname === 'supabase.com' || parsedUrl.hostname.endsWith('.supabase.com')) {
    throw new Error(`SUPABASE_URL points to the Supabase website, not a project API. ${SUPABASE_URL_HINT}`);
  }
  const isSupabaseProjectHost = parsedUrl.hostname.endsWith('.supabase.co');
  if (!isSupabaseProjectHost && (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash)) {
    throw new Error('SUPABASE_URL must be the Supabase project base URL without a path, query, or fragment.');
  }
  const isSecretKey = Boolean(secretKey);
  const isSecretKeyFormat = secretKey.startsWith('sb_secret_');
  const isLegacyServiceRoleJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(legacyServiceRoleKey);
  if (isSecretKey && !isSecretKeyFormat) {
    throw new Error(`SUPABASE_SECRET_KEY must start with sb_secret_. ${SERVICE_ROLE_KEY_HINT}`);
  }
  if (isSecretKey && !isLegacyServiceRoleJwt) {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be the legacy service_role JWT for Storage Authorization. ${SERVICE_ROLE_KEY_HINT}`);
  }
  if (!isSecretKey && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceRoleKey)) {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be a legacy service_role JWT. ${SERVICE_ROLE_KEY_HINT}`);
  }
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) {
    throw new Error('SUPABASE_BACKUP_BUCKET must be a valid Supabase Storage bucket name.');
  }

  return {
    client: createClient(parsedUrl.origin, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      // Storage requires a JWT in Authorization. Keep the new API key in
      // apikey, and use the legacy service_role JWT for Authorization.
      ...(isSecretKey ? {
        global: {
          fetch: (input, init = {}) => {
            const headers = new Headers(init.headers);
            headers.set('Authorization', `Bearer ${legacyServiceRoleKey}`);
            return fetch(input, { ...init, headers });
          },
        },
      } : {}),
    }),
    bucket,
    encryptionKey: Buffer.from(keyHex, 'hex'),
  };
}

async function readDatabaseSnapshot() {
  const client = await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = {};
    for (const table of BACKUP_TABLES) {
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      tables[table] = rows;
    }
    await client.query('COMMIT');
    return tables;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[BACKUP] Snapshot rollback failed:', rollbackError.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

function encryptSnapshot(snapshot, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(snapshot), 'utf8')),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from('EABK'),
    Buffer.from([1]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

function decryptSnapshot(encrypted, key) {
  if (encrypted.length < 33 || encrypted.subarray(0, 4).toString() !== 'EABK' || encrypted[4] !== 1) {
    throw new Error('The selected file is not a supported Enterprise Auth backup.');
  }
  const iv = encrypted.subarray(5, 17);
  const authTag = encrypted.subarray(17, 33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const cleartext = Buffer.concat([decipher.update(encrypted.subarray(33)), decipher.final()]);
  let snapshot;
  try {
    snapshot = JSON.parse(cleartext.toString('utf8'));
  } catch {
    throw new Error('The selected backup could not be parsed after decryption.');
  }
  if (snapshot.format !== 'enterprise-auth-database-backup' || snapshot.version !== 1
      || !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)) {
    throw new Error('The selected backup has an unsupported format.');
  }
  for (const table of REQUIRED_BACKUP_TABLES) {
    if (!Array.isArray(snapshot.tables[table])) {
      throw new Error(`The selected backup is missing the ${table} table.`);
    }
  }
  if (snapshot.tables.user_linked_accounts !== undefined
      && !Array.isArray(snapshot.tables.user_linked_accounts)) {
    throw new Error('The selected backup has invalid linked-account data.');
  }
  for (const table of BACKUP_TABLES) {
    const rows = snapshot.tables[table] || [];
    if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`The selected backup has invalid rows in ${table}.`);
    }
  }
  return snapshot;
}

async function requirePrivateBucket(supabase, bucket) {
  let result;
  try {
    result = await supabase.storage.getBucket(bucket);
  } catch (error) {
    if (isHtmlResponseError(error)) {
      throw new Error(`Supabase Storage returned HTML instead of JSON. ${SUPABASE_URL_HINT}`);
    }
    throw error;
  }
  const { data, error } = result;
  if (error) {
    if (isHtmlResponseError(error)) {
      throw new Error(`Supabase Storage returned HTML instead of JSON. ${SUPABASE_URL_HINT}`);
    }
    throw new Error(
      `Supabase backup bucket "${bucket}" must exist and be private: ${error.message || String(error)}`
    );
  }
  if (data.public) {
    throw new Error(`Supabase backup bucket "${bucket}" must be private.`);
  }
}

function createBackupName(date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `database-backup-${timestamp}-${crypto.randomUUID()}.eab`;
}

async function createCloudBackup() {
  const { client: supabase, bucket, encryptionKey } = getBackupConfig();
  await requirePrivateBucket(supabase, bucket);
  const createdAt = new Date();
  const tables = await readDatabaseSnapshot();
  const encrypted = encryptSnapshot({
    format: 'enterprise-auth-database-backup',
    version: 1,
    createdAt: createdAt.toISOString(),
    tables,
  }, encryptionKey);

  const configuredLimit = Number.parseInt(process.env.BACKUP_MAX_BYTES || '', 10);
  const maxBytes = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : MAX_BACKUP_BYTES;
  if (encrypted.length > maxBytes) {
    throw new Error(`Encrypted backup is ${encrypted.length} bytes, above the configured ${maxBytes}-byte limit.`);
  }

  const name = createBackupName(createdAt);
  const { error } = await supabase.storage.from(bucket).upload(name, encrypted, {
    contentType: 'application/octet-stream',
    cacheControl: '0',
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase Storage rejected the backup: ${error.message}`);
  }

  return {
    name,
    createdAt: createdAt.toISOString(),
    size: encrypted.length,
    tableCounts: Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, rows.length])
    ),
  };
}

async function listCloudBackups() {
  const { client: supabase, bucket } = getBackupConfig();
  await requirePrivateBucket(supabase, bucket);
  const { data, error } = await supabase.storage.from(bucket).list('', {
    limit: 100,
    sortBy: { column: 'name', order: 'desc' },
  });
  if (error) {
    throw new Error(`Could not list backups in Supabase Storage: ${error.message}`);
  }

  return (data || [])
    .filter((item) => item.id && /^database-backup-.+\.eab$/.test(item.name))
    .map((item) => ({
      name: item.name,
      createdAt: item.created_at || item.updated_at,
      size: item.metadata?.size || null,
    }));
}

async function restoreCloudBackup(name) {
  if (typeof name !== 'string' || !/^database-backup-.+\.eab$/.test(name) || name.includes('/') || name.includes('\\')) {
    throw new Error('Choose a valid backup file from Supabase Storage.');
  }

  const { client: supabase, bucket, encryptionKey } = getBackupConfig();
  await requirePrivateBucket(supabase, bucket);
  const { data, error } = await supabase.storage.from(bucket).download(name);
  if (error || !data) {
    throw new Error(`Could not download backup from Supabase Storage: ${error?.message || 'file not found'}`);
  }

  const configuredLimit = Number.parseInt(process.env.BACKUP_MAX_BYTES || '', 10);
  const maxBytes = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : MAX_BACKUP_BYTES;
  const encrypted = Buffer.from(await data.arrayBuffer());
  if (encrypted.length > maxBytes) {
    throw new Error(`Selected backup is ${encrypted.length} bytes, above the configured ${maxBytes}-byte limit.`);
  }
  const snapshot = decryptSnapshot(encrypted, encryptionKey);
  const tables = { ...snapshot.tables };
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Backups created before linked-account backups were added can still be
    // restored without discarding linked accounts for users in that snapshot.
    if (!Array.isArray(tables.user_linked_accounts)) {
      const { rows } = await client.query('SELECT * FROM user_linked_accounts');
      const restoredUserIds = new Set(tables.users.map((user) => user.id));
      tables.user_linked_accounts = rows.filter((row) => restoredUserIds.has(row.user_id));
    }
    await client.query(`TRUNCATE TABLE ${BACKUP_TABLES.join(', ')} RESTART IDENTITY`);
    for (const table of BACKUP_TABLES) {
      for (const row of tables[table] || []) {
        const columns = Object.keys(row);
        if (!columns.length) continue;
        const identifiers = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ');
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${identifiers}) VALUES (${placeholders})`,
          columns.map((column) => row[column])
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[BACKUP] Restore rollback failed:', rollbackError.message);
    }
    throw err;
  } finally {
    client.release();
  }

  return {
    name,
    createdAt: snapshot.createdAt,
    tableCounts: Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table]?.length || 0])),
  };
}

module.exports = { createCloudBackup, listCloudBackups, restoreCloudBackup };
