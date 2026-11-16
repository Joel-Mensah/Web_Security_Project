'use strict';

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('SUPABASE_DATABASE_URL must point to the hosted Supabase PostgreSQL database.');
}

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error('SUPABASE_DATABASE_URL must be a valid PostgreSQL connection URL.');
}
if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
  throw new Error('SUPABASE_DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}
if (!parsedDatabaseUrl.hostname || !parsedDatabaseUrl.pathname.slice(1)) {
  throw new Error('SUPABASE_DATABASE_URL must include a PostgreSQL host and database name.');
}
if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('SUPABASE_DATABASE_URL must connect to hosted Supabase, not a local database.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: process.env.VERCEL === '1' ? 5 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected Supabase pool error:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB] query (${Date.now() - start}ms):`, text.slice(0, 80));
  }
  return result;
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
