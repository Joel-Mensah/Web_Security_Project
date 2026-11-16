'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const { log, AuditAction } = require('../services/auditService');
const { createCloudBackup, listCloudBackups } = require('../services/cloudBackupService');
const {
  getApplicationRestorePoints,
  rollbackApplication,
} = require('../services/awsRestoreService');

const router = express.Router();

router.use(authenticate, authorizeRole(['administrator']));

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

router.get('/backups', async (_req, res) => {
  try {
    res.json({ backups: await listCloudBackups() });
  } catch (err) {
    console.error('[SYSTEM] Could not list cloud backups:', err.message);
    res.status(503).json({ message: err.message || 'Could not list cloud backups.' });
  }
});

router.post('/backups', async (req, res) => {
  try {
    const backup = await createCloudBackup();
    await log({
      userId: req.user.id,
      actorId: req.user.id,
      action: AuditAction.SYSTEM_BACKUP_CREATED,
      ipAddress: getIp(req),
      details: { name: backup.name, size: backup.size, tableCounts: backup.tableCounts },
    });
    res.status(201).json({
      message: 'Encrypted database backup saved to private Supabase Storage.',
      backup,
    });
  } catch (err) {
    console.error('[SYSTEM] Cloud backup failed:', err.message);
    res.status(503).json({ message: err.message || 'Could not create a cloud backup.' });
  }
});

router.get('/restore-points', async (_req, res) => {
  try {
    res.json({ restorePoints: await getApplicationRestorePoints() });
  } catch (err) {
    console.error('[SYSTEM] Could not list application restore points:', err.message);
    res.status(503).json({ message: err.message || 'Could not load application restore points.' });
  }
});

router.post(
  '/restore-points',
  [
    body('commitSha').isString().trim().matches(/^[a-f\d]{7,64}$/i),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    await log({
      userId: req.user.id,
      actorId: req.user.id,
      action: AuditAction.APPLICATION_RESTORE_REQUESTED,
      ipAddress: getIp(req),
      details: { commitSha: req.body.commitSha },
    });

    try {
      const restored = await rollbackApplication({
        commitSha: req.body.commitSha,
      });
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: AuditAction.APPLICATION_RESTORE_STARTED,
        ipAddress: getIp(req),
        details: restored,
      });
      res.json({
        message: 'Application restore started. Database records were not changed.',
        restorePoint: restored,
      });
    } catch (err) {
      console.error('[SYSTEM] Application restore failed:', err.message);
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: AuditAction.APPLICATION_RESTORE_FAILED,
        ipAddress: getIp(req),
        details: {
          commitSha: req.body.commitSha,
          message: err.message,
          succeeded: err.succeeded || [],
          failures: err.failures || [],
        },
      });
      res.status(err.status || 502).json({
        message: err.message || 'Application restore failed.',
        succeeded: err.succeeded || [],
        failures: err.failures || [],
      });
    }
  }
);

module.exports = router;
