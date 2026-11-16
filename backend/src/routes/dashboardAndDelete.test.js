'use strict';

const mockQuery = jest.fn();
const mockLog = jest.fn();

jest.mock('../config/db', () => ({
  query: mockQuery,
  getClient: jest.fn(),
}));

jest.mock('../services/cryptoService', () => ({
  generateSalt: jest.fn(),
  hashPassword: jest.fn(),
}));

jest.mock('../services/auditService', () => ({
  log: mockLog,
  AuditAction: { USER_DELETED: 'USER_DELETED' },
}));

jest.mock('../services/emailService', () => ({
  sendAccountSetupLink: jest.fn(),
}));

jest.mock('../middleware/requireDatabase', () => ({
  ensureDatabaseOnline: jest.fn(),
  requireDatabaseOnline: jest.fn(),
}));

jest.mock('../middleware/authorizeRole', () => () => (_req, _res, next) => next());

const router = require('./users');
const summaryHandler = router.stack
  .find((layer) => layer.route?.path === '/dashboard-summary')
  .route.stack.at(-1).handle;
const deleteHandler = router.stack
  .find((layer) => layer.route?.path === '/:id' && layer.route.methods.delete)
  .route.stack.at(-1).handle;

function makeResponse() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockLog.mockReset().mockResolvedValue(undefined);
});

test('returns account health metrics for the dashboard', async () => {
  const metrics = {
    total_users: 12,
    active_users: 10,
    mfa_enabled_users: 8,
    setup_pending: 2,
  };
  mockQuery.mockResolvedValue({ rows: [metrics] });
  const response = makeResponse();

  await summaryHandler({}, response);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('COUNT(*) FILTER (WHERE is_active)')
  );
  expect(response.json).toHaveBeenCalledWith(metrics);
});

test('allows an Admin to delete an Administrator account', async () => {
  const target = {
    id: '00000000-0000-0000-0000-000000000003',
    username: 'system-admin',
    role: 'administrator',
  };
  mockQuery.mockImplementation(async (text) => (
    text.startsWith('SELECT id, username, role') ? { rows: [target] } : { rows: [] }
  ));
  const response = makeResponse();

  await deleteHandler(
    {
      params: { id: target.id },
      user: {
        id: '00000000-0000-0000-0000-000000000002',
        username: 'admin',
        role: 'admin',
      },
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(mockQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [target.id]);
  expect(response.json).toHaveBeenCalledWith({
    message: "User 'system-admin' deleted successfully",
  });
});

test.each(['manager', 'admin'])('keeps Admin from deleting a %s account', async (role) => {
  const target = {
    id: '00000000-0000-0000-0000-000000000003',
    username: 'protected-user',
    role,
  };
  mockQuery.mockImplementation(async (text) => (
    text.startsWith('SELECT id, username, role') ? { rows: [target] } : { rows: [] }
  ));
  const response = makeResponse();

  await deleteHandler(
    {
      params: { id: target.id },
      user: {
        id: '00000000-0000-0000-0000-000000000002',
        username: 'admin',
        role: 'admin',
      },
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  expect(mockQuery).not.toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [target.id]);
  expect(response.status).toHaveBeenCalledWith(403);
  expect(response.json).toHaveBeenCalledWith({
    message: 'Admins may only delete Inputer or Administrator accounts',
  });
});
