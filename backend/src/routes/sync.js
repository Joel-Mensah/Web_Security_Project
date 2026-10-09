'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');
const { log } = require('../services/auditService');
const { getOpenConflicts, resolveConflict } = require('../services/syncService');

const router = express.Router();

router.use(authenticate, authorizeRole(['administrator']));

router.get('/conflicts', async (_req, res) => {
  try {
    res.json({ conflicts: await getOpenConflicts() });
  } catch (err) {
    console.error('[SYNC] Could not load conflicts:', err.message);
    res.status(500).json({ message: 'Could not load synchronization conflicts' });
  }
});

router.post(
  '/conflicts/:id/resolve',
  [
    param('id').isUUID(),
    body('resolution').isIn(['local', 'supabase']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const resolved = await resolveConflict(req.params.id, req.body.resolution);
      if (!resolved) return res.status(404).json({ message: 'Open conflict not found' });
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: 'SYNC_CONFLICT_RESOLVED',
        ipAddress: req.ip,
        details: { conflictId: req.params.id, resolution: req.body.resolution },
      });
      res.json({ message: 'Synchronization conflict resolved' });
    } catch (err) {
      console.error('[SYNC] Could not resolve conflict:', err.message);
      res.status(500).json({ message: 'Could not resolve synchronization conflict' });
    }
  }
);

module.exports = router;
