'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { Pool } = require('pg');
const { pool: localPool } = require('../config/db');

const SYNC_CRON = process.env.SYNC_CRON || '* * * * *';
const BATCH_SIZE = 250;
const TABLES = {
  users: [
    'id', 'username', 'email', 'password_hash', 'salt', 'mfa_secret',
    'mfa_enabled', 'email_otp_hash', 'email_otp_expires_at', 'role',
    'is_active', 'last_login_at', 'created_at', 'updated_at',
  ],
  audit_logs: [
    'id', 'user_id', 'actor_id', 'action', 'ip_address', 'details', 'created_at',
  ],
};

let remotePool;
let syncInProgress = false;

function getRemotePool() {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error('SUPABASE_DATABASE_URL must be set for Supabase synchronization');
  }
  if (!remotePool) {
    remotePool = new Pool({
      connectionString: process.env.SUPABASE_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    remotePool.on('error', (err) => {
      console.error('[SYNC] Unexpected Supabase pool error:', err.message);
    });
  }
  return remotePool;
}

async function applyMigration(database) {
  const syncSql = fs.readFileSync(
    path.resolve(__dirname, '../../../database/sync.sql'),
    'utf8'
  );
  await database.query(syncSql);
}

async function getNodeState(database) {
  const { rows } = await database.query(
    `SELECT node_id, peer_cursor, initial_sync_completed,
            bootstrap_started, bootstrap_users_done, bootstrap_audit_done,
            bootstrap_users_cursor, bootstrap_audit_cursor
     FROM sync_node WHERE singleton = TRUE`
  );
  if (!rows[0]) throw new Error('Sync metadata is missing; apply database/sync.sql');
  return rows[0];
}

function buildUpsert(table, payload) {
  const columns = TABLES[table];
  if (!columns || !payload || typeof payload !== 'object' || !payload.id) {
    throw new Error(`Unsupported synchronization row for table "${table}"`);
  }
  const values = columns.map((column) => payload[column] === undefined ? null : payload[column]);
  const parameters = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${parameters})
           ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values,
  };
}

async function applyEvent(client, event) {
  if (!Object.hasOwn(TABLES, event.table_name)) {
    throw new Error(`Unsupported synchronization table: ${event.table_name}`);
  }
  if (event.operation === 'DELETE') {
    await client.query(`DELETE FROM ${event.table_name} WHERE id = $1`, [event.row_id]);
    return;
  }
  const statement = buildUpsert(event.table_name, event.payload);
  await client.query(statement.text, statement.values);
}

async function importTable(remote, local, table, cursorColumn, doneColumn) {
  let state = await getNodeState(local);
  let cursor = state[cursorColumn];
  while (!state[doneColumn]) {
    const { rows } = await remote.query(
      `SELECT to_jsonb(source_row) AS payload
       FROM ${table} AS source_row
       WHERE ($1::uuid IS NULL OR source_row.id > $1::uuid)
       ORDER BY source_row.id
       LIMIT $2`,
      [cursor, BATCH_SIZE]
    );

    if (rows.length === 0) {
      await local.query(`UPDATE sync_node SET ${doneColumn} = TRUE WHERE singleton = TRUE`);
      state = await getNodeState(local);
      continue;
    }

    const client = await local.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.sync_apply', 'true', TRUE)");
      for (const row of rows) {
        const statement = buildUpsert(table, row.payload);
        await client.query(statement.text, statement.values);
      }
      cursor = rows[rows.length - 1].payload.id;
      await client.query(`UPDATE sync_node SET ${cursorColumn} = $1 WHERE singleton = TRUE`, [cursor]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    state = await getNodeState(local);
  }
}

async function bootstrap() {
  const remote = getRemotePool();
  await applyMigration(localPool);
  await applyMigration(remote);

  let localState = await getNodeState(localPool);
  if (!localState.initial_sync_completed) {
    const client = await localPool.connect();
    try {
      await client.query('BEGIN');
      const lockedState = await client.query(
        'SELECT bootstrap_started FROM sync_node WHERE singleton = TRUE FOR UPDATE'
      );
      if (!lockedState.rows[0].bootstrap_started) {
        const { rows } = await client.query(
          `SELECT
             (SELECT COUNT(*) FROM users) AS users,
             (SELECT COUNT(*) FROM audit_logs) AS audit_logs`
        );
        if (Number(rows[0].users) || Number(rows[0].audit_logs)) {
          throw new Error(
            'Initial sync requires empty local users and audit_logs tables. ' +
            'No local data was replaced.'
          );
        }
        await client.query('UPDATE sync_node SET bootstrap_started = TRUE WHERE singleton = TRUE');
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await importTable(remote, localPool, 'users', 'bootstrap_users_cursor', 'bootstrap_users_done');
    await importTable(remote, localPool, 'audit_logs', 'bootstrap_audit_cursor', 'bootstrap_audit_done');
    await localPool.query(
      'UPDATE sync_node SET initial_sync_completed = TRUE WHERE singleton = TRUE'
    );
  }

  await remote.query(
    'UPDATE sync_node SET initial_sync_completed = TRUE WHERE singleton = TRUE'
  );
  localState = await getNodeState(localPool);
  console.log(`[SYNC] Initial local copy is ready (local node ${localState.node_id}).`);
}

async function findPendingTargetEvent(database, tableName, rowId, acknowledgedCursor) {
  const { rows } = await database.query(
    `SELECT id, operation, row_id, table_name, payload
     FROM sync_outbox
     WHERE table_name = $1 AND row_id = $2 AND id > $3
     ORDER BY id DESC LIMIT 1`,
    [tableName, rowId, acknowledgedCursor]
  );
  return rows[0] || null;
}

async function findUniqueConflictingRow(database, event) {
  let result = await database.query(
    `SELECT to_jsonb(target_row) AS payload
     FROM ${event.table_name} AS target_row
     WHERE target_row.id = $1`,
    [event.row_id]
  );
  if (!result.rows[0] && event.table_name === 'users') {
    result = await database.query(
      `SELECT to_jsonb(target_row) AS payload
       FROM users AS target_row
       WHERE target_row.username = $1 OR target_row.email = $2
       ORDER BY target_row.id
       LIMIT 1`,
      [event.payload.username, event.payload.email]
    );
  }
  return result.rows[0]?.payload || null;
}

async function recordConflict(localEvent, remoteEvent, database = localPool) {
  const localSnapshot = localEvent ? localEvent.payload : null;
  const remoteSnapshot = remoteEvent ? remoteEvent.payload : null;
  const tableName = (localEvent || remoteEvent).table_name;
  const rowId = (localEvent || remoteEvent).row_id;
  const localOperation = localEvent ? localEvent.operation : 'MISSING';
  const remoteOperation = remoteEvent ? remoteEvent.operation : 'MISSING';
  await database.query(
    `INSERT INTO sync_conflicts (
       table_name, row_id, local_event_id, remote_event_id,
       local_operation, remote_operation, local_payload, remote_payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (
       table_name, row_id,
       (COALESCE(local_event_id, -1)),
       (COALESCE(remote_event_id, -1))
     ) WHERE status = 'open' DO NOTHING`,
    [
      tableName, rowId, localEvent?.id || null, remoteEvent?.id || null,
      localOperation, remoteOperation, localSnapshot, remoteSnapshot,
    ]
  );
  console.warn(`[SYNC] Conflict queued for administrator review: ${tableName}/${rowId}`);
}

async function refreshOpenConflict(event, side, database = localPool) {
  const { rows } = await database.query(
    `SELECT id FROM sync_conflicts
     WHERE status = 'open' AND table_name = $1
       AND (
         row_id = $2
         OR local_payload ->> 'id' = $2::text
         OR remote_payload ->> 'id' = $2::text
       )
     ORDER BY created_at DESC LIMIT 1`,
    [event.table_name, event.row_id]
  );
  if (!rows[0]) return false;

  if (side === 'local') {
    await database.query(
      `UPDATE sync_conflicts
       SET local_event_id = $2, local_operation = $3, local_payload = $4
       WHERE id = $1`,
      [rows[0].id, event.id, event.operation, event.payload]
    );
  } else {
    await database.query(
      `UPDATE sync_conflicts
       SET remote_event_id = $2, remote_operation = $3, remote_payload = $4
       WHERE id = $1`,
      [rows[0].id, event.id, event.operation, event.payload]
    );
  }
  return true;
}

async function advanceCursor(database, eventId) {
  await database.query(
    'UPDATE sync_node SET peer_cursor = GREATEST(peer_cursor, $1) WHERE singleton = TRUE',
    [eventId]
  );
}

async function processIncomingEvents(target, sourceSide, events, targetAckCursor) {
  let applied = 0;
  let conflicts = 0;
  for (const event of events) {
    const client = await target.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.sync_apply', 'true', TRUE)");
      await client.query(
        `SELECT id FROM ${event.table_name} WHERE id = $1 FOR UPDATE`,
        [event.row_id]
      );

      const side = sourceSide === 'local' ? 'local' : 'remote';
      if (await refreshOpenConflict(
        event,
        side,
        target === localPool ? client : localPool
      )) {
        await client.query(
          'UPDATE sync_node SET peer_cursor = GREATEST(peer_cursor, $1) WHERE singleton = TRUE',
          [event.id]
        );
        await client.query('COMMIT');
        continue;
      }

      const pendingTargetEvent = await findPendingTargetEvent(
        client,
        event.table_name,
        event.row_id,
        targetAckCursor
      );
      if (pendingTargetEvent) {
        const localEvent = sourceSide === 'local' ? event : pendingTargetEvent;
        const remoteEvent = sourceSide === 'supabase' ? event : pendingTargetEvent;
        await recordConflict(
          localEvent,
          remoteEvent,
          target === localPool ? client : localPool
        );
        await client.query(
          'UPDATE sync_node SET peer_cursor = GREATEST(peer_cursor, $1) WHERE singleton = TRUE',
          [event.id]
        );
        await client.query('COMMIT');
        conflicts++;
        continue;
      }

      await applyEvent(client, event);
      await client.query(
        'UPDATE sync_node SET peer_cursor = GREATEST(peer_cursor, $1) WHERE singleton = TRUE',
        [event.id]
      );
      await client.query('COMMIT');
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code !== '23505') throw err;
      const currentPayload = await findUniqueConflictingRow(target, event);
      const currentEvent = currentPayload
        ? {
            id: null,
            table_name: event.table_name,
            row_id: currentPayload.id,
            operation: 'UPDATE',
            payload: currentPayload,
          }
        : null;
      const localEvent = sourceSide === 'local' ? event : currentEvent;
      const remoteEvent = sourceSide === 'supabase' ? event : currentEvent;
      await recordConflict(localEvent, remoteEvent);
      await advanceCursor(target, event.id);
      conflicts++;
      console.error(`[SYNC] Unique-key conflict for ${event.table_name}/${event.row_id}`);
    } finally {
      client.release();
    }
  }
  return { applied, conflicts };
}

async function syncOnce() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const remote = getRemotePool();
    const localState = await getNodeState(localPool);
    const remoteState = await getNodeState(remote);
    if (!localState.initial_sync_completed || !remoteState.initial_sync_completed) {
      throw new Error('Initial sync is incomplete; run npm run sync:bootstrap while online');
    }

    const { rows: remoteEvents } = await remote.query(
      `SELECT id, operation, row_id, table_name, payload
       FROM sync_outbox WHERE id > $1 ORDER BY id LIMIT $2`,
      [localState.peer_cursor, BATCH_SIZE]
    );
    const { rows: localEvents } = await localPool.query(
      `SELECT id, operation, row_id, table_name, payload
       FROM sync_outbox WHERE id > $1 ORDER BY id LIMIT $2`,
      [remoteState.peer_cursor, BATCH_SIZE]
    );

    const pulled = await processIncomingEvents(
      localPool, 'supabase', remoteEvents, remoteState.peer_cursor
    );
    const pushed = await processIncomingEvents(
      remote, 'local', localEvents, localState.peer_cursor
    );

    const [updatedLocalState, updatedRemoteState] = await Promise.all([
      getNodeState(localPool),
      getNodeState(remote),
    ]);
    await Promise.all([
      localPool.query('DELETE FROM sync_outbox WHERE id <= $1', [updatedRemoteState.peer_cursor]),
      remote.query('DELETE FROM sync_outbox WHERE id <= $1', [updatedLocalState.peer_cursor]),
    ]);

    if (pulled.applied || pulled.conflicts || pushed.applied || pushed.conflicts) {
      console.log(
        `[SYNC] Supabase → local: ${pulled.applied} applied, ${pulled.conflicts} conflicts; ` +
        `local → Supabase: ${pushed.applied} applied, ${pushed.conflicts} conflicts`
      );
    }
  } finally {
    syncInProgress = false;
  }
}

function startSyncCron() {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error('SUPABASE_DATABASE_URL must be configured before starting synchronization');
  }
  if (!cron.validate(SYNC_CRON)) throw new Error(`Invalid SYNC_CRON schedule: ${SYNC_CRON}`);
  return localPool.query(
    'SELECT 1 FROM sync_node WHERE singleton = TRUE AND initial_sync_completed = TRUE'
  ).then(({ rows }) => {
    if (!rows.length) {
      throw new Error('Run npm run sync:bootstrap before starting the application');
    }
    cron.schedule(SYNC_CRON, () => {
      syncOnce().catch((err) => console.error('[SYNC] Scheduled sync failed:', err.message));
    });
    syncOnce().catch((err) => console.error('[SYNC] Initial sync attempt failed:', err.message));
    console.log(`[SYNC] Supabase synchronization scheduled: "${SYNC_CRON}"`);
  });
}

async function ensureCloudOnline() {
  await getRemotePool().query('SELECT 1');
}

function requireCloudForAuth(_req, res, next) {
  ensureCloudOnline().then(() => next()).catch((err) => {
    console.error('[SYNC] Cloud is required for authentication changes:', err.message);
    res.status(503).json({ message: 'This authentication action requires an internet connection.' });
  });
}

async function getOpenConflicts() {
  const { rows } = await localPool.query(
    `SELECT id, table_name, row_id, local_operation, remote_operation,
            local_payload, remote_payload, created_at
     FROM sync_conflicts WHERE status = 'open'
     ORDER BY created_at DESC LIMIT 200`
  );
  return rows.map((conflict) => {
    const safeSnapshot = (payload) => {
      if (!payload) return null;
      if (conflict.table_name === 'users') {
        const { username, email, role, is_active, mfa_enabled, last_login_at, updated_at } = payload;
        return { username, email, role, is_active, mfa_enabled, last_login_at, updated_at };
      }
      const { user_id, actor_id, action, ip_address, details, created_at } = payload;
      return { user_id, actor_id, action, ip_address, details, created_at };
    };
    return {
      id: conflict.id,
      table: conflict.table_name,
      rowId: conflict.row_id,
      local: { operation: conflict.local_operation, data: safeSnapshot(conflict.local_payload) },
      supabase: { operation: conflict.remote_operation, data: safeSnapshot(conflict.remote_payload) },
      createdAt: conflict.created_at,
    };
  });
}

async function resolveConflict(conflictId, winner) {
  if (!['local', 'supabase'].includes(winner)) {
    throw new Error('Resolution must be "local" or "supabase"');
  }
  const client = await localPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM sync_conflicts
       WHERE id = $1 AND status = 'open' FOR UPDATE`,
      [conflictId]
    );
    const conflict = rows[0];
    if (!conflict) {
      await client.query('ROLLBACK');
      return false;
    }
    const operation = winner === 'local'
      ? conflict.local_operation
      : conflict.remote_operation;
    const payload = winner === 'local'
      ? conflict.local_payload
      : conflict.remote_payload;
    const localId = conflict.local_payload?.id;
    const remoteId = conflict.remote_payload?.id;
    const chosenId = payload?.id || (winner === 'local' ? remoteId : localId);
    const losingId = winner === 'local' ? remoteId : localId;
    await client.query("SELECT set_config('app.sync_apply', 'true', TRUE)");

    if (winner === 'supabase' && losingId && losingId !== chosenId) {
      await client.query(`DELETE FROM ${conflict.table_name} WHERE id = $1`, [losingId]);
    }
    if (operation === 'MISSING' || !payload || operation === 'DELETE') {
      if (chosenId) {
        await client.query(`DELETE FROM ${conflict.table_name} WHERE id = $1`, [chosenId]);
      }
    } else {
      await applyEvent(client, {
        table_name: conflict.table_name,
        operation,
        row_id: chosenId,
        payload,
      });
    }

    if (winner === 'local' && losingId && losingId !== chosenId) {
      await insertOutboxEvent(client, conflict.table_name, 'DELETE', losingId, conflict.remote_payload);
    }
    const chosenOperation = operation === 'MISSING' ? 'DELETE' : operation;
    const chosenPayload = payload || (winner === 'local' ? conflict.remote_payload : conflict.local_payload);
    if (chosenId && chosenPayload) {
      await insertOutboxEvent(client, conflict.table_name, chosenOperation, chosenId, chosenPayload);
    }
    await client.query(
      `UPDATE sync_conflicts SET status = 'resolved', resolution = $2, resolved_at = NOW()
       WHERE id = $1`,
      [conflictId, winner]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function insertOutboxEvent(client, tableName, operation, rowId, payload) {
  await client.query(
    `INSERT INTO sync_outbox (origin_node_id, table_name, operation, row_id, payload)
     SELECT node_id, $1, $2, $3, $4
     FROM sync_node WHERE singleton = TRUE`,
    [tableName, operation, rowId, payload]
  );
}

async function close() {
  try {
    if (remotePool) await remotePool.end();
  } finally {
    await localPool.end();
  }
}

module.exports = {
  bootstrap,
  close,
  ensureCloudOnline,
  getOpenConflicts,
  requireCloudForAuth,
  resolveConflict,
  startSyncCron,
  syncOnce,
};

if (require.main === module) {
  const operation = process.argv.includes('--bootstrap') ? bootstrap : syncOnce;
  operation()
    .catch((err) => {
      console.error('[SYNC] Fatal:', err.message);
      process.exitCode = 1;
    })
    .finally(close);
}
