'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const { log, AuditAction } = require('../services/auditService');
const { createCloudBackup, listCloudBackups } = require('../services/cloudBackupService');

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
      message: 'Encrypted database backup saved to private cloud storage.',
      backup,
    });
  } catch (err) {
    console.error('[SYSTEM] Cloud backup failed:', err.message);
    res.status(503).json({ message: err.message || 'Could not create a cloud backup.' });
  }
});

module.exports = router;
