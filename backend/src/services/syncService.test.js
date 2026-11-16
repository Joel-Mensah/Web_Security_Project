'use strict';

const mockRemotePool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockRemotePool),
}));

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  },
}));

const { pool: localPool } = require('../config/db');
const { applyMigrations, startSyncCron, syncOnce } = require('./syncService');
const mockLocalMigrationQuery = jest.fn(async () => ({ rows: [] }));
const mockRemoteMigrationQuery = jest.fn(async () => ({ rows: [] }));

const nodeState = {
  node_id: '00000000-0000-0000-0000-000000000001',
  peer_cursor: 0,
  initial_sync_completed: true,
  bootstrap_started: true,
  bootstrap_users_done: true,
  bootstrap_audit_done: true,
  bootstrap_incidents_done: true,
  bootstrap_incident_updates_done: true,
  bootstrap_users_cursor: null,
  bootstrap_audit_cursor: null,
  bootstrap_incidents_cursor: null,
  bootstrap_incident_updates_cursor: null,
};

beforeEach(() => {
  process.env.SUPABASE_DATABASE_URL = 'postgresql://sync-test.invalid/test';
  delete process.env.VERCEL;
  mockLocalMigrationQuery.mockReset().mockResolvedValue({ rows: [] });
  mockRemoteMigrationQuery.mockReset().mockResolvedValue({ rows: [] });
  localPool.connect.mockReset().mockResolvedValue({
    query: mockLocalMigrationQuery,
    release: jest.fn(),
  });
  mockRemotePool.connect.mockReset().mockResolvedValue({
    query: mockRemoteMigrationQuery,
    release: jest.fn(),
  });
  localPool.query.mockReset().mockImplementation(async (text) => {
    if (text.startsWith('SELECT 1 FROM sync_node')) return { rows: [{ ready: 1 }] };
    if (text.startsWith('SELECT node_id')) return { rows: [nodeState] };
    if (text.includes('FROM sync_outbox')) return { rows: [] };
    return { rows: [] };
  });
  mockRemotePool.query.mockReset().mockImplementation(async (text) => {
    if (text.startsWith('SELECT node_id')) return { rows: [nodeState] };
    if (text.includes('FROM sync_outbox')) return { rows: [] };
    return { rows: [] };
  });
});

afterAll(() => {
  delete process.env.SUPABASE_DATABASE_URL;
});

test('startup applies the migration to both databases before scheduling sync', async () => {
  await expect(startSyncCron()).resolves.toBeUndefined();

  expect(mockLocalMigrationQuery).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS incident_updates')
  );
  expect(mockRemoteMigrationQuery).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS incident_updates')
  );
  expect(mockLocalMigrationQuery).toHaveBeenCalledWith(
    'SELECT pg_advisory_xact_lock(7426119203481)'
  );
  expect(localPool.query.mock.calls.findIndex(([text]) => text.startsWith('SELECT 1 FROM sync_node')))
    .toBe(0);
});

test('hosted deployments migrate their single Supabase database without starting a peer pool', async () => {
  process.env.VERCEL = '1';

  await expect(applyMigrations()).resolves.toBeUndefined();

  expect(mockLocalMigrationQuery).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS incident_updates')
  );
  expect(mockRemotePool.connect).not.toHaveBeenCalled();
});

test('syncOnce applies incident records through the synchronization outbox', async () => {
  const incidentEvent = {
    id: 2,
    operation: 'INSERT',
    row_id: '00000000-0000-0000-0000-000000000004',
    table_name: 'incidents',
    payload: {
      id: '00000000-0000-0000-0000-000000000004',
      title: 'Unexpected account approval prompt',
      description: 'An unexpected account approval appeared while I was not signing in.',
      category: 'account_compromise',
      severity: 'high',
      status: 'new',
      reporter_id: '00000000-0000-0000-0000-000000000002',
      assignee_id: null,
      resolution_summary: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      resolved_at: null,
    },
  };
  mockRemotePool.query.mockImplementation(async (text) => {
    if (text.startsWith('SELECT node_id')) return { rows: [nodeState] };
    if (text.includes('FROM sync_outbox')) return { rows: [incidentEvent] };
    return { rows: [] };
  });
  const clientQuery = jest.fn(async () => ({ rows: [] }));
  localPool.connect.mockResolvedValue({
    query: clientQuery,
    release: jest.fn(),
  });

  await expect(syncOnce()).resolves.toBeUndefined();

  const upsert = clientQuery.mock.calls.find(([text]) => text.startsWith('INSERT INTO incidents'));
  expect(upsert).toBeDefined();
  expect(upsert[1]).toContain('Unexpected account approval prompt');
});

test('syncOnce applies legacy user rows with a null credential setup flag', async () => {
  const userEvent = {
    id: 1,
    operation: 'UPDATE',
    row_id: '00000000-0000-0000-0000-000000000002',
    table_name: 'users',
    payload: {
      id: '00000000-0000-0000-0000-000000000002',
      username: 'sync-test',
      email: 'sync-test@example.invalid',
      password_hash: 'hash',
      salt: 'salt',
      mfa_enabled: false,
      role: 'inputer',
      is_active: true,
      credential_setup_required: null,
      last_login_at: null,
    },
  };
  mockRemotePool.query.mockImplementation(async (text) => {
    if (text.startsWith('SELECT node_id')) return { rows: [nodeState] };
    if (text.includes('FROM sync_outbox')) return { rows: [userEvent] };
    return { rows: [] };
  });
  const clientQuery = jest.fn(async () => ({ rows: [] }));
  localPool.connect.mockResolvedValue({
    query: clientQuery,
    release: jest.fn(),
  });

  await expect(syncOnce()).resolves.toBeUndefined();

  const upsert = clientQuery.mock.calls.find(([text]) => text.startsWith('INSERT INTO users'));
  expect(upsert).toBeDefined();
  expect(upsert[1][12]).toBe(false);
});
