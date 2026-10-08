// src/config/db.js
// PostgreSQL connection pool with optional SSL and parameterised query helper
'use strict';

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isRemote = Boolean(process.env.DATABASE_URL || process.env.DB_SSL === 'true');
const sslConfig = isRemote
  ? { rejectUnauthorized: false }
  : false;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'enterprise_auth',
      user:     process.env.DB_USER     || 'postgres',
      password: String(process.env.DB_PASSWORD || ''),
      ssl:      sslConfig,
      max:      10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD && process.env.NODE_ENV !== 'test') {
  console.warn('\n⚠️  [DB WARNING] Neither DATABASE_URL nor DB_PASSWORD is set in backend/.env!');
  console.warn('   PostgreSQL SCRAM authentication requires a valid string password or DATABASE_URL.\n');
}

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
