'use strict';

const mockEvents = [];
const mockQuery = jest.fn();
const mockLog = jest.fn();
const mockSendAccountSetupLink = jest.fn();
const mockEnsureCloudOnline = jest.fn();
const mockSyncSetupToken = jest.fn();

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
  AuditAction: {},
}));

jest.mock('../services/emailService', () => ({
  sendAccountSetupLink: mockSendAccountSetupLink,
}));

jest.mock('../services/syncService', () => ({
  ensureCloudOnline: mockEnsureCloudOnline,
  syncSetupToken: mockSyncSetupToken,
}));

jest.mock('../middleware/authorizeRole', () => () => (_req, _res, next) => next());

const router = require('./users');
const summaryRoute = router.stack.find(
  (layer) => layer.route?.path === '/dashboard-summary'
).route;
const summaryHandler = summaryRoute.stack[summaryRoute.stack.length - 1].handle;
const setupLinkRoute = router.stack.find(
  (layer) => layer.route?.path === '/:id/send-setup-link'
).route;
const setupLinkHandler = setupLinkRoute.stack[setupLinkRoute.stack.length - 1].handle;
const deleteRoute = router.stack.find(
  (layer) => layer.route?.path === '/:id' && layer.route.methods.delete
).route;
const deleteHandler = deleteRoute.stack[deleteRoute.stack.length - 1].handle;

beforeEach(() => {
  mockEvents.length = 0;
  mockEnsureCloudOnline.mockReset().mockResolvedValue(undefined);
  mockSyncSetupToken.mockReset().mockImplementation(async () => {
    mockEvents.push('sync');
  });
  mockSendAccountSetupLink.mockReset().mockImplementation(async () => {
    mockEvents.push('email');
  });
  mockLog.mockReset().mockResolvedValue(undefined);
  mockQuery.mockReset().mockImplementation(async (text) => {
    mockEvents.push(text);
    if (text.startsWith('SELECT id, username, email, role')) {
      return {
        rows: [{
          id: '00000000-0000-0000-0000-000000000001',
          username: 'new-user',
          email: 'new-user@example.com',
          role: 'inputer',
          is_active: true,
          credential_setup_required: true,
        }],
      };
    }
    if (text.includes('RETURNING id')) {
      return { rows: [{ id: '00000000-0000-0000-0000-000000000001' }] };
    }
    return { rows: [] };
  });
  process.env.ACCOUNT_SETUP_URL = 'https://example.com';
});

afterAll(() => {
  delete process.env.ACCOUNT_SETUP_URL;
});

test('returns account health metrics for the dashboard', async () => {
  const metrics = {
    total_users: 12,
    active_users: 10,
    mfa_enabled_users: 8,
    setup_pending: 2,
  };
  mockQuery.mockResolvedValueOnce({ rows: [metrics] });
  const response = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

  await summaryHandler({}, response);

  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('COUNT(*) FILTER (WHERE is_active)'));
  expect(response.json).toHaveBeenCalledWith(metrics);
});

test('allows an Admin to delete an Administrator account', async () => {
  const target = {
    id: '00000000-0000-0000-0000-000000000003',
    username: 'system-admin',
    role: 'administrator',
  };
  mockQuery.mockImplementation(async (text) => {
    if (text.startsWith('SELECT id, username, role')) return { rows: [target] };
    return { rows: [] };
  });
  const response = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

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
  const response = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

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

test('starts the 30-minute setup link expiry after Gmail accepts the email', async () => {
  const response = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };

  await setupLinkHandler(
    {
      params: { id: '00000000-0000-0000-0000-000000000001' },
      user: { id: '00000000-0000-0000-0000-000000000002', role: 'administrator' },
      headers: {},
      ip: '127.0.0.1',
    },
    response
  );

  const initialExpiryIndex = mockEvents.findIndex(
    (event) => typeof event === 'string' && event.includes("INTERVAL '1 hour'")
  );
  const emailIndex = mockEvents.indexOf('email');
  const finalExpiryIndex = mockEvents.findIndex(
    (event) => typeof event === 'string' && event.includes("INTERVAL '30 minutes'")
  );

  expect(initialExpiryIndex).toBeGreaterThan(-1);
  expect(emailIndex).toBeGreaterThan(initialExpiryIndex);
  expect(finalExpiryIndex).toBeGreaterThan(emailIndex);
  expect(mockEvents.indexOf('sync', emailIndex)).toBeGreaterThan(finalExpiryIndex);
  expect(mockSyncSetupToken).toHaveBeenCalledTimes(2);
  expect(response.json).toHaveBeenCalledWith({
    message: 'Password setup email sent to new-user@example.com',
  });
});
