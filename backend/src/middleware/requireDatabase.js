'use strict';

const { pool } = require('../config/db');

async function ensureDatabaseOnline() {
  await pool.query('SELECT 1');
}

function requireDatabaseOnline(_req, res, next) {
  ensureDatabaseOnline()
    .then(() => next())
    .catch((err) => {
      console.error('[DB] Database is required for this action:', err.message);
      res.status(503).json({ message: 'The database is temporarily unavailable. Please try again.' });
    });
}

module.exports = { ensureDatabaseOnline, requireDatabaseOnline };
