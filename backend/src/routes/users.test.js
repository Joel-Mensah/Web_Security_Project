'use strict';

const mockEvents = [];
const mockQuery = jest.fn();
const mockLog = jest.fn();
const mockSendAccountSetupLink = jest.fn();
const mockEnsureDatabaseOnline = jest.fn();
const mockAuthorizeRole = jest.fn((roles) => {
  const middleware = (_req, _res, next) => next();
  middleware.requiredRoles = roles;
  return middleware;
});

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

jest.mock('../middleware/requireDatabase', () => ({
  ensureDatabaseOnline: mockEnsureDatabaseOnline,
}));

jest.mock('../middleware/authorizeRole', () => mockAuthorizeRole);

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
const usersRoute = router.stack.find(
  (layer) => layer.route?.path === '/'
).route;
const usersHandler = usersRoute.stack[usersRoute.stack.length - 1].handle;
const securityOverviewRoute = router.stack.find(
  (layer) => layer.route?.path === '/security-overview'
).route;
const securityOverviewHandler =
  securityOverviewRoute.stack[securityOverviewRoute.stack.length - 1].handle;

beforeEach(() => {
  mockEvents.length = 0;
  mockEnsureDatabaseOnline.mockReset().mockResolvedValue(undefined);
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

test('returns account security metadata without credential values', async () => {
  const listedUser = {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'new-user',
    email: 'new-user@example.com',
    role: 'inputer',
    password_algorithm: 'Argon2id',
    salt_present: true,
  };
  mockQuery.mockImplementation(async (text) => (
    text.includes('FROM users ORDER BY created_at')
      ? { rows: [listedUser] }
      : { rows: [{ count: '1' }] }
  ));
  const response = { json: jest.fn(), status: jest.fn().mockReturnThis() };

  await usersHandler({ query: {} }, response);

  expect(mockQuery.mock.calls[0][0]).toContain('END AS password_algorithm');
  expect(mockQuery.mock.calls[0][0]).toContain('AS salt_present');
  expect(mockQuery.mock.calls[0][0]).not.toMatch(/SELECT[^]*password_hash\s*,/i);
  expect(mockQuery.mock.calls[0][0]).not.toMatch(/SELECT[^]*,\s*salt\s+FROM/i);
  expect(response.json).toHaveBeenCalledWith({
    users: [listedUser],
    total: 1,
    page: 1,
    pageSize: 20,
  });
});

test('returns safe Argon2id and salt settings in the security overview', async () => {
  process.env.SECRET_PEPPER = 'test-pepper';
  const response = { json: jest.fn() };

  await securityOverviewHandler({}, response);

  expect(response.json).toHaveBeenCalledWith({
    passwordHashing: {
      algorithm: 'Argon2id',
      memoryCostKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
    salt: { bytesPerUser: 16, uniquePerUser: true },
    pepper: { configured: true, storage: 'backend environment' },
    plaintextPasswordsRecoverable: false,
  });
  expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('test-pepper');
  delete process.env.SECRET_PEPPER;
});

test('restricts the security overview route to Admin and Administrator roles', () => {
  expect(mockAuthorizeRole).toHaveBeenCalledWith(['admin', 'administrator']);
  expect(securityOverviewRoute.stack).toHaveLength(2);
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

  const expiryIndex = mockEvents.findIndex(
    (event) => typeof event === 'string' && event.includes("INTERVAL '30 minutes'")
  );
  const emailIndex = mockEvents.indexOf('email');

  expect(expiryIndex).toBeGreaterThan(-1);
  expect(emailIndex).toBeGreaterThan(-1);
  expect(expiryIndex).toBeGreaterThan(emailIndex);
  expect(response.json).toHaveBeenCalledWith({
    message: 'Password setup email sent to new-user@example.com',
  });
});
