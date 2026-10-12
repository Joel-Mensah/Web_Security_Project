'use strict';

const mockQuery = jest.fn();
const mockLog = jest.fn();

jest.mock('../services/auditService', () => ({
  log: mockLog,
  AuditAction: { UNAUTHORIZED: 'UNAUTHORIZED' },
}));

jest.mock('../config/db', () => ({ query: mockQuery }));

const authorizeRole = require('./authorizeRole');

beforeEach(() => {
  mockQuery.mockReset();
  mockLog.mockReset().mockResolvedValue(undefined);
});

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

test('authorizes using the current database role when the token has an old role', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ role: 'administrator', is_active: true }],
  });
  const req = {
    user: { id: 'user-id', role: 'inputer' },
    ip: '127.0.0.1',
  };
  const res = createResponse();
  const next = jest.fn();

  await authorizeRole(['administrator'])(req, res, next);

  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT role, is_active FROM users WHERE id = $1',
    ['user-id']
  );
  expect(req.user.role).toBe('administrator');
  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
});

test('denies the role in the database when the token has an old administrator role', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ role: 'inputer', is_active: true }],
  });
  const req = {
    user: { id: 'user-id', role: 'administrator' },
    ip: '127.0.0.1',
    originalUrl: '/api/sync/conflicts',
    method: 'GET',
  };
  const res = createResponse();
  const next = jest.fn();

  await authorizeRole(['administrator'])(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
    details: expect.objectContaining({ userRole: 'inputer' }),
  }));
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({
    message: 'Access denied. Required role(s): administrator',
  });
});
