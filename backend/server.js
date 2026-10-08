// server.js — Enterprise Auth Express Application Entry Point
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

const authRouter  = require('./src/routes/auth');
const usersRouter = require('./src/routes/users');
const { pool }    = require('./src/config/db');
const { startBackupCron } = require('./src/scripts/backup');

const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);  // Required for rate-limiter behind nginx/reverse proxy

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Rate limiting ─────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max:      isDev ? 1000 : parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// Stricter limiter for login endpoints (relaxed in dev)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      isDev ? 100 : 10,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Root route ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    message: 'Enterprise Auth API server is running.',
    frontend_url: process.env.FRONTEND_URL || 'http://localhost:5173',
    health_check: '/health',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',  authLimiter, authRouter);
app.use('/api/users', usersRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Verify DB connectivity before accepting requests
    await pool.query('SELECT 1');
    console.log('[DB] PostgreSQL connection verified ✅');
  } catch (err) {
    console.error('[DB] Cannot connect to PostgreSQL. Ensure DB is running and .env is configured.');
    console.error(err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   CORS origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
  });

  // Start encrypted backup cron
  startBackupCron();
}

start();
