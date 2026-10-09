// src/config/db.js
// Local-primary PostgreSQL connection pool with parameterised query helper
'use strict';

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isVercel = process.env.VERCEL === '1';
if (isVercel) {
  const hostedDatabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!hostedDatabaseUrl) {
    throw new Error('Set SUPABASE_DATABASE_URL in the Vercel backend project environment variables.');
  }
  const pool = new Pool({
    connectionString: hostedDatabaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
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
} else {
const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
let localDatabasePassword = '';
let parsedLocalDatabaseUrl;
if (!localDatabaseUrl && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'LOCAL_DATABASE_URL must point to the local PostgreSQL database. ' +
    'The app will not use DATABASE_URL because it may point to Supabase.'
  );
}

if (localDatabaseUrl) {
  try {
    parsedLocalDatabaseUrl = new URL(localDatabaseUrl);
  } catch {
    throw new Error('LOCAL_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedLocalDatabaseUrl.protocol)) {
    throw new Error('LOCAL_DATABASE_URL must use the postgres:// or postgresql:// scheme');
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsedLocalDatabaseUrl.hostname)) {
    throw new Error('LOCAL_DATABASE_URL must connect to PostgreSQL on this computer');
  }
  localDatabasePassword = process.env.LOCAL_DATABASE_PASSWORD ||
    decodeURIComponent(parsedLocalDatabaseUrl.password);
  if (!localDatabasePassword && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Set LOCAL_DATABASE_PASSWORD in backend/.env to your local PostgreSQL password.'
    );
  }
}

const poolConfig = parsedLocalDatabaseUrl
  ? {
      host: parsedLocalDatabaseUrl.hostname.replace(/^\[|\]$/g, ''),
      port: parseInt(parsedLocalDatabaseUrl.port || '5432', 10),
      database: decodeURIComponent(parsedLocalDatabaseUrl.pathname.slice(1)),
      user: decodeURIComponent(parsedLocalDatabaseUrl.username),
      password: localDatabasePassword,
      ssl: process.env.LOCAL_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }
  : {
      connectionString: 'postgres://postgres@localhost:5432/enterprise_auth',
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

const pool = new Pool(poolConfig);

// Verify connectivity on startup
pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterised SQL query.
 * @param {string} text  - SQL query with $1, $2 … placeholders
 * @param {any[]}  params - Bound parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    console.log(`[DB] query (${duration}ms):`, text.slice(0, 80));
  }
  return result;
}

/**
 * Acquire a client for multi-statement transactions.
 * Always release in a finally block.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
}
