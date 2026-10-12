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
const { startSyncCron, syncOnce } = require('./syncService');

const nodeState = {
  node_id: '00000000-0000-0000-0000-000000000001',
  peer_cursor: 0,
  initial_sync_completed: true,
  bootstrap_started: true,
  bootstrap_users_done: true,
  bootstrap_audit_done: true,
  bootstrap_users_cursor: null,
  bootstrap_audit_cursor: null,
};

beforeEach(() => {
  process.env.SUPABASE_DATABASE_URL = 'postgresql://sync-test.invalid/test';
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

  expect(localPool.query).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS password_reset_codes')
  );
  expect(mockRemotePool.query).toHaveBeenCalledWith(
    expect.stringContaining('CREATE TABLE IF NOT EXISTS password_reset_codes')
  );
  expect(localPool.query.mock.calls.findIndex(([text]) => text.startsWith('SELECT 1 FROM sync_node')))
    .toBeGreaterThan(0);
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
