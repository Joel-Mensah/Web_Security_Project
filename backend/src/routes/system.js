'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const { log, AuditAction } = require('../services/auditService');
const { createCloudBackup, listCloudBackups, restoreCloudBackup } = require('../services/cloudBackupService');

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

router.post('/backups/:name/restore', async (req, res) => {
  try {
    const restored = await restoreCloudBackup(req.params.name);
    await log({
      userId: req.user.id,
      actorId: req.user.id,
      action: AuditAction.SYSTEM_BACKUP_RESTORED,
      ipAddress: getIp(req),
      details: { name: restored.name, tableCounts: restored.tableCounts },
    });
    res.json({
      message: 'Database restored from the selected Supabase backup. Current database records were replaced.',
      restored,
    });
  } catch (err) {
    console.error('[SYSTEM] Database restore failed:', err.message);
    await log({
      userId: req.user.id,
      actorId: req.user.id,
      action: AuditAction.SYSTEM_BACKUP_RESTORE_FAILED,
      ipAddress: getIp(req),
      details: { name: req.params.name, message: err.message },
    });
    res.status(503).json({ message: err.message || 'Could not restore the Supabase backup.' });
  }
});

module.exports = router;
