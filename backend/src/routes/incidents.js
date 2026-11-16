'use strict';

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const crypto = require('crypto');
const multer = require('multer');
const { query, getClient } = require('../config/db');
const { log, AuditAction } = require('../services/auditService');
const {
  MAX_FILE_BYTES,
  MAX_FILES,
  uploadIncidentEvidence,
  removeIncidentEvidence,
  createEvidenceSignedUrl,
} = require('../services/incidentEvidenceService');
const authenticate = require('../middleware/authenticate');
const authorizeRole = require('../middleware/authorizeRole');

const router = express.Router();
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 4 },
});
const ROLES = ['inputer', 'manager', 'admin', 'administrator'];
const TRIAGE_ROLES = ['manager', 'admin', 'administrator'];
const CATEGORIES = [
  'suspicious_email', 'account_compromise', 'lost_device',
  'data_exposure', 'malware', 'policy_violation', 'other',
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'closed'];

router.use(authenticate, authorizeRole(ROLES));

const isTriageRole = (role) => TRIAGE_ROLES.includes(role);
const isValidationError = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ errors: errors.array() });
  return true;
};
const canSeeAll = (user) => isTriageRole(user.role);
const visibleScope = (user, firstParameter) => (
  canSeeAll(user)
    ? { sql: '', values: [] }
    : {
        sql: ` AND (i.reporter_id = $${firstParameter} OR i.assignee_id = $${firstParameter})`,
        values: [user.id],
      }
);
const ipAddress = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

function sendDatabaseError(label, err, res) {
  console.error(`[INCIDENTS] ${label}:`, err.message);
  res.status(500).json({ message: 'The incident request could not be completed.' });
}

async function rollback(client, label) {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch (err) {
    console.error(`[INCIDENTS] ${label} rollback failed:`, err.message);
  }
}

function receiveEvidence(req, res, next) {
  evidenceUpload.array('evidence', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge
          ? 'Each screenshot must be 5 MB or smaller.'
          : `Could not accept uploaded evidence (${err.code}). Attach up to ${MAX_FILES} screenshots.`,
      });
    }
    console.error('[INCIDENTS] Evidence upload parsing failed:', err.message);
    return res.status(400).json({ message: 'Could not read the uploaded evidence.' });
  });
}

function publicUpdate(update) {
  if (!update.details?.evidence) return update;
  const { objectPath, ...evidence } = update.details.evidence;
  return { ...update, details: { ...update.details, evidence } };
}

function publicEvidence(item) {
  const { objectPath, extension, ...metadata } = item;
  return metadata;
}

router.get('/summary', async (req, res) => {
  try {
    const scope = canSeeAll(req.user)
      ? ''
      : 'WHERE reporter_id = $1 OR assignee_id = $1';
    const values = canSeeAll(req.user) ? [] : [req.user.id];
    const { rows } = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('new', 'triaged', 'in_progress'))::int AS open,
              COUNT(*) FILTER (WHERE severity IN ('high', 'critical')
                                AND status NOT IN ('resolved', 'closed'))::int AS urgent,
              COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
       FROM incidents ${scope}`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    sendDatabaseError('GET /summary failed', err, res);
  }
});

router.get('/assignees', async (req, res) => {
  if (!isTriageRole(req.user.role)) {
    return res.status(403).json({ message: 'Only incident managers can view assignment options.' });
  }
  try {
    const { rows } = await query(
      `SELECT id, username, role
       FROM users
       WHERE is_active = TRUE
       ORDER BY username`
    );
    res.json(rows);
  } catch (err) {
    sendDatabaseError('GET /assignees failed', err, res);
  }
});

router.get('/', async (req, res) => {
  const { status, severity, category, search } = req.query;
  if (status && (typeof status !== 'string' || !STATUSES.includes(status))) {
    return res.status(400).json({ message: 'Invalid status filter.' });
  }
  if (severity && (typeof severity !== 'string' || !SEVERITIES.includes(severity))) {
    return res.status(400).json({ message: 'Invalid severity filter.' });
  }
  if (category && (typeof category !== 'string' || !CATEGORIES.includes(category))) {
    return res.status(400).json({ message: 'Invalid category filter.' });
  }
  if (search && (typeof search !== 'string' || search.length > 100)) {
    return res.status(400).json({ message: 'Search must be 100 characters or fewer.' });
  }

  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '25', 10) || 25));
  const values = [];
  const filters = [];
  const scope = visibleScope(req.user, 1);
  if (scope.sql) {
    values.push(...scope.values);
    filters.push(scope.sql.trim().replace(/^AND /, ''));
  }
  for (const [column, value] of [
    ['i.status', status],
    ['i.severity', severity],
    ['i.category', category],
  ]) {
    if (value) {
      values.push(value);
      filters.push(`${column} = $${values.length}`);
    }
  }
  if (search) {
    values.push(`%${search.trim()}%`);
    filters.push(`(i.title ILIKE $${values.length} OR i.description ILIKE $${values.length})`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const filterValues = [...values];
  values.push(limit, (page - 1) * limit);

  try {
    const [incidents, count] = await Promise.all([
      query(
        `SELECT i.id, i.title, i.category, i.severity, i.status, i.reporter_id,
                i.assignee_id, i.created_at, i.updated_at, i.resolved_at,
                reporter.username AS reporter_username,
                assignee.username AS assignee_username
         FROM incidents i
         LEFT JOIN users reporter ON reporter.id = i.reporter_id
         LEFT JOIN users assignee ON assignee.id = i.assignee_id
         ${where}
         ORDER BY CASE i.severity
                    WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3 ELSE 4
                  END,
                  i.updated_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      ),
      query(`SELECT COUNT(*)::int AS total FROM incidents i ${where}`, filterValues),
    ]);
    res.json({ incidents: incidents.rows, total: count.rows[0].total, page, limit });
  } catch (err) {
    sendDatabaseError('GET / failed', err, res);
  }
});

router.post(
  '/',
  receiveEvidence,
  [
    body('title').trim().isLength({ min: 5, max: 160 }),
    body('description').trim().isLength({ min: 20, max: 10000 }),
    body('category').isIn(CATEGORIES),
    body('severity').optional().isIn(SEVERITIES),
  ],
  async (req, res) => {
    if (isValidationError(req, res)) return;
    let client;
    let evidence = [];
    let committed = false;
    const incidentId = crypto.randomUUID();
    try {
      evidence = await uploadIncidentEvidence(incidentId, req.files || []);
      client = await getClient();
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO incidents (id, title, description, category, severity, reporter_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          incidentId,
          req.body.title.trim(),
          req.body.description.trim(),
          req.body.category,
          req.body.severity || 'medium',
          req.user.id,
        ]
      );
      const incident = rows[0];
      await client.query(
        `INSERT INTO incident_updates
           (incident_id, actor_id, update_type, message, details)
         VALUES ($1, $2, 'status', 'Incident report submitted', $3)`,
        [incident.id, req.user.id, JSON.stringify({ to: 'new' })]
      );
      await client.query(
        `INSERT INTO incident_updates
           (incident_id, update_type, message, details)
         VALUES ($1, 'comment', $2, $3)`,
        [
          incident.id,
          'Your report has been received. The response team will review it and post updates in this conversation. If you face an immediate threat, contact your organization’s security team or local emergency services directly.',
          JSON.stringify({ systemMessage: true }),
        ]
      );
      for (const item of evidence) {
        const { objectPath, extension, ...publicEvidence } = item;
        await client.query(
          `INSERT INTO incident_updates
             (incident_id, actor_id, update_type, message, details)
           VALUES ($1, $2, 'comment', $3, $4)`,
          [
            incident.id,
            req.user.id,
            `Screenshot evidence attached: ${item.fileName}`,
            JSON.stringify({
              evidence: { ...publicEvidence, objectPath },
            }),
          ]
        );
      }
      await client.query('COMMIT');
      committed = true;
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: AuditAction.INCIDENT_REPORTED,
        ipAddress: ipAddress(req),
        details: {
          incidentId: incident.id,
          category: incident.category,
          severity: incident.severity,
          evidenceCount: evidence.length,
        },
      });
      res.status(201).json({ ...incident, evidence: evidence.map(publicEvidence) });
    } catch (err) {
      await rollback(client, 'report submission');
      if (!committed && evidence.length) {
        await removeIncidentEvidence(evidence).catch((cleanupError) => {
          console.error('[INCIDENTS] Failed to clean up unlinked evidence:', cleanupError.message);
        });
      }
      if (err.statusCode === 400) {
        return res.status(400).json({ message: err.message });
      }
      sendDatabaseError('POST / failed', err, res);
    } finally {
      client?.release();
    }
  }
);

router.get('/:id', [param('id').isUUID()], async (req, res) => {
  if (isValidationError(req, res)) return;
  const scope = visibleScope(req.user, 3);
  try {
    const { rows } = await query(
      `SELECT i.*, reporter.username AS reporter_username,
              assignee.username AS assignee_username,
              (
                i.reporter_id = $2
                AND i.reporter_response_at IS NULL
                AND i.referred_to_authority_at IS NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM incident_updates response
                  JOIN users responder ON responder.id = response.actor_id
                  WHERE response.incident_id = i.id
                    AND response.update_type = 'comment'
                    AND response.is_internal = FALSE
                    AND responder.role IN ('manager', 'admin', 'administrator')
                )
              ) AS reporter_can_edit
       FROM incidents i
       LEFT JOIN users reporter ON reporter.id = i.reporter_id
       LEFT JOIN users assignee ON assignee.id = i.assignee_id
       WHERE i.id = $1${scope.sql}`,
      [req.params.id, req.user.id, ...scope.values]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Incident not found.' });

    const activityValues = [req.params.id];
    let visibility = '';
    if (!canSeeAll(req.user)) visibility = ' AND u.is_internal = FALSE';
    const { rows: updates } = await query(
      `SELECT u.id, u.actor_id, u.update_type, u.message, u.is_internal, u.details, u.created_at,
              actor.username AS actor_username
       FROM incident_updates u
       LEFT JOIN users actor ON actor.id = u.actor_id
       WHERE u.incident_id = $1${visibility}
       ORDER BY u.created_at ASC`,
      activityValues
    );
    res.json({ incident: rows[0], updates: updates.map(publicUpdate) });
  } catch (err) {
    sendDatabaseError('GET /:id failed', err, res);
  }
});

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('title').trim().isLength({ min: 5, max: 160 }),
    body('description').trim().isLength({ min: 20, max: 10000 }),
    body('category').isIn(CATEGORIES),
    body('severity').isIn(SEVERITIES),
  ],
  async (req, res) => {
    if (isValidationError(req, res)) return;
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM incidents WHERE id = $1 AND reporter_id = $2 FOR UPDATE',
        [req.params.id, req.user.id]
      );
      const incident = rows[0];
      if (!incident) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Incident not found.' });
      }
      if (incident.referred_to_authority_at) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This report can no longer be edited because it was referred for investigation.',
        });
      }
      if (incident.reporter_response_at) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This report can no longer be edited because a responder has replied.',
        });
      }

      const { rows: responses } = await client.query(
        `SELECT 1
         FROM incident_updates response
         JOIN users responder ON responder.id = response.actor_id
         WHERE response.incident_id = $1
           AND response.update_type = 'comment'
           AND response.is_internal = FALSE
           AND responder.role IN ('manager', 'admin', 'administrator')
         LIMIT 1`,
        [req.params.id]
      );
      if (responses.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This report can no longer be edited because a responder has replied.',
        });
      }

      const { rows: updated } = await client.query(
        `UPDATE incidents
         SET title = $1, description = $2, category = $3, severity = $4
         WHERE id = $5
         RETURNING *`,
        [
          req.body.title.trim(),
          req.body.description.trim(),
          req.body.category,
          req.body.severity,
          req.params.id,
        ]
      );
      await client.query(
        `INSERT INTO incident_updates
           (incident_id, actor_id, update_type, message, details)
         VALUES ($1, $2, 'comment', 'Reporter edited the incident report', $3)`,
        [
          req.params.id,
          req.user.id,
          JSON.stringify({
            editedFields: ['title', 'description', 'category', 'severity'],
          }),
        ]
      );
      await client.query('COMMIT');
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: AuditAction.INCIDENT_REPORT_EDITED,
        ipAddress: ipAddress(req),
        details: { incidentId: req.params.id },
      });
      res.json(updated[0]);
    } catch (err) {
      await rollback(client, 'report edit');
      sendDatabaseError('PATCH /:id failed', err, res);
    } finally {
      client?.release();
    }
  }
);

router.get(
  '/:id/evidence/:evidenceId',
  [param('id').isUUID(), param('evidenceId').isUUID()],
  async (req, res) => {
    if (isValidationError(req, res)) return;
    const scope = visibleScope(req.user, 3);
    try {
      const { rows } = await query(
        `SELECT u.details->'evidence' AS evidence
         FROM incidents i
         JOIN incident_updates u ON u.incident_id = i.id
         WHERE i.id = $1
           AND u.update_type = 'comment'
           AND u.is_internal = FALSE
           AND u.details->'evidence'->>'id' = $2${scope.sql}`,
        [req.params.id, req.params.evidenceId, ...scope.values]
      );
      const evidence = rows[0]?.evidence;
      const extensionByType = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };
      if (
        !evidence ||
        evidence.objectPath !== `incidents/${req.params.id}/${req.params.evidenceId}.${extensionByType[evidence.contentType]}`
      ) {
        return res.status(404).json({ message: 'Evidence not found.' });
      }
      const signedUrl = await createEvidenceSignedUrl(evidence.objectPath);
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: AuditAction.INCIDENT_EVIDENCE_VIEWED,
        ipAddress: ipAddress(req),
        details: { incidentId: req.params.id, evidenceId: evidence.id },
      });
      res.json({ url: signedUrl, expiresIn: 60 });
    } catch (err) {
      sendDatabaseError('GET /:id/evidence/:evidenceId failed', err, res);
    }
  }
);

router.patch(
  '/:id/triage',
  [
    param('id').isUUID(),
    body('status').optional().isIn(STATUSES),
    body('severity').optional().isIn(SEVERITIES),
    body('assigneeId').optional({ nullable: true }).isUUID(),
    body('resolutionSummary').optional().trim().isLength({ min: 10, max: 5000 }),
    body('referToAuthority').optional().isBoolean(),
  ],
  async (req, res) => {
    if (isValidationError(req, res)) return;
    if (!isTriageRole(req.user.role)) {
      return res.status(403).json({ message: 'Only incident managers can triage reports.' });
    }
    if (
      (req.body.referToAuthority === true || req.body.referToAuthority === 'true') &&
      !['admin', 'administrator'].includes(req.user.role)
    ) {
      return res.status(403).json({ message: 'Only Admins and Administrators can record an authority referral.' });
    }
    const allowedFields = ['status', 'severity', 'assigneeId', 'resolutionSummary', 'referToAuthority'];
    if (!allowedFields.some((field) => Object.hasOwn(req.body, field))) {
      return res.status(400).json({ message: 'Provide at least one triage change.' });
    }

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const { rows: existingRows } = await client.query(
        'SELECT * FROM incidents WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const existing = existingRows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Incident not found.' });
      }

      const nextStatus = req.body.status || existing.status;
      const nextSummary = req.body.resolutionSummary ?? existing.resolution_summary;
      if (nextStatus === 'resolved' && !nextSummary) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Add a resolution summary before marking an incident resolved.',
        });
      }
      if (Object.hasOwn(req.body, 'assigneeId') && req.body.assigneeId) {
        const { rows: users } = await client.query(
          'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
          [req.body.assigneeId]
        );
        if (!users[0]) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Choose an active user as the assignee.' });
        }
      }

      const changes = [];
      const values = [];
      const set = (column, value) => {
        values.push(value);
        changes.push(`${column} = $${values.length}`);
      };
      const eventEntries = [];
      if (req.body.status && req.body.status !== existing.status) {
        set('status', req.body.status);
        eventEntries.push({
          type: 'status',
          message: `Status changed from ${existing.status.replaceAll('_', ' ')} to ${req.body.status.replaceAll('_', ' ')}`,
          details: { from: existing.status, to: req.body.status },
        });
      }
      if (req.body.severity && req.body.severity !== existing.severity) {
        set('severity', req.body.severity);
        eventEntries.push({
          type: 'severity',
          message: `Severity changed from ${existing.severity} to ${req.body.severity}`,
          details: { from: existing.severity, to: req.body.severity },
        });
      }
      if (Object.hasOwn(req.body, 'assigneeId') && req.body.assigneeId !== existing.assignee_id) {
        set('assignee_id', req.body.assigneeId || null);
        eventEntries.push({
          type: 'assignment',
          message: req.body.assigneeId ? 'Incident assignment updated' : 'Incident unassigned',
          details: { assigneeId: req.body.assigneeId || null },
        });
      }
      if (
        Object.hasOwn(req.body, 'resolutionSummary') &&
        req.body.resolutionSummary !== existing.resolution_summary
      ) {
        set('resolution_summary', req.body.resolutionSummary);
        eventEntries.push({
          type: 'resolution',
          message: 'Resolution summary updated',
          details: {},
        });
      }
      if (
        (req.body.referToAuthority === true || req.body.referToAuthority === 'true') &&
        !existing.referred_to_authority_at
      ) {
        changes.push('referred_to_authority_at = NOW()');
        eventEntries.push({
          type: 'status',
          message: 'Report referred to Ghana Authority Security for investigation',
          details: { referredToAuthority: true },
          isInternal: false,
        });
      }
      if (req.body.status) {
        values.push(req.body.status);
        changes.push(
          `resolved_at = CASE WHEN $${values.length} = 'resolved' THEN COALESCE(resolved_at, NOW()) ` +
          `WHEN $${values.length} IN ('new', 'triaged', 'in_progress') THEN NULL ELSE resolved_at END`
        );
      }
      let incident = existing;
      if (changes.length) {
        values.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE incidents SET ${changes.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        incident = rows[0];
      }
      for (const entry of eventEntries) {
        await client.query(
          `INSERT INTO incident_updates
             (incident_id, actor_id, update_type, message, is_internal, details)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            incident.id,
            req.user.id,
            entry.type,
            entry.message,
            entry.isInternal !== false,
            JSON.stringify(entry.details),
          ]
        );
      }
      await client.query('COMMIT');
      if (eventEntries.length) {
        await log({
          userId: req.user.id,
          actorId: req.user.id,
          action: AuditAction.INCIDENT_TRIAGED,
          ipAddress: ipAddress(req),
          details: { incidentId: incident.id, changed: eventEntries.map((entry) => entry.type) },
        });
      }
      res.json(incident);
    } catch (err) {
      await rollback(client, 'incident triage');
      sendDatabaseError('PATCH /:id/triage failed', err, res);
    } finally {
      client?.release();
    }
  }
);

router.post(
  '/:id/updates',
  [
    param('id').isUUID(),
    body('message').trim().isLength({ min: 2, max: 5000 }),
    body('internal').optional().isBoolean(),
  ],
  async (req, res) => {
    if (isValidationError(req, res)) return;
    const internal = req.body.internal === true || req.body.internal === 'true';
    if (internal && !isTriageRole(req.user.role)) {
      return res.status(403).json({ message: 'Only incident managers can add private notes.' });
    }
    const scope = visibleScope(req.user, 2);
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      const { rows: incidents } = await client.query(
        `SELECT i.id FROM incidents i WHERE i.id = $1${scope.sql} FOR UPDATE`,
        [req.params.id, ...scope.values]
      );
      if (!incidents[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Incident not found.' });
      }
      const { rows } = await client.query(
        `INSERT INTO incident_updates
           (incident_id, actor_id, update_type, message, is_internal, details)
         VALUES ($1, $2, 'comment', $3, $4, '{}')
         RETURNING id, incident_id, actor_id, update_type, message, is_internal, details, created_at`,
        [req.params.id, req.user.id, req.body.message.trim(), internal]
      );
      const managerReply = !internal && isTriageRole(req.user.role);
      await client.query(
        `UPDATE incidents
         SET updated_at = NOW(),
             reporter_response_at = CASE
               WHEN $2 THEN COALESCE(reporter_response_at, NOW())
               ELSE reporter_response_at
             END
         WHERE id = $1`,
        [req.params.id, managerReply]
      );
      await client.query('COMMIT');
      await log({
        userId: req.user.id,
        actorId: req.user.id,
        action: internal ? AuditAction.INCIDENT_PRIVATE_NOTE_ADDED : AuditAction.INCIDENT_COMMENT_ADDED,
        ipAddress: ipAddress(req),
        details: { incidentId: req.params.id },
      });
      res.status(201).json(rows[0]);
    } catch (err) {
      await rollback(client, 'incident update');
      sendDatabaseError('POST /:id/updates failed', err, res);
    } finally {
      client?.release();
    }
  }
);

module.exports = router;
