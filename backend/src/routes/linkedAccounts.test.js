// src/routes/linkedAccounts.test.js — handler contract with mocked db + audit
'use strict';

const mockQuery = jest.fn();
const mockLog = jest.fn();

jest.mock('../config/db', () => ({ query: mockQuery }));
jest.mock('../services/auditService', () => ({
  log: mockLog,
  AuditAction: {
    ACCOUNT_LINK_INITIATED: 'ACCOUNT_LINK_INITIATED',
    ACCOUNT_LINKED: 'ACCOUNT_LINKED',
    ACCOUNT_UNLINKED: 'ACCOUNT_UNLINKED',
  },
}));
jest.mock('../middleware/authenticate', () => (req, _res, next) => {
  req.user = { id: 'user-1', username: 'tester', role: 'inputer' };
  next();
});

process.env.BACKUP_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');

const router = require('./linkedAccountsIndex');

function getHandler(path, method) {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method]
  );
  return layer.route.stack.at(-1).handle;
}

function makeRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

const listHandler = () => getHandler('/me/linked-accounts', 'get');
const connectHandler = () => getHandler('/me/linked-accounts/connect/:provider', 'post');
const unlinkHandler = () => getHandler('/me/linked-accounts/:id', 'delete');

describe('linked-accounts routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockLog.mockReset();
  });

  test('GET list redacts raw tokens', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a1', provider: 'google', provider_account_id: 'gid-1',
        provider_email: 'u@gmail.com', metadata: { displayName: 'U' },
        created_at: 'now', updated_at: 'now',
      }],
    });
    const req = { user: { id: 'user-1' } };
    const res = makeRes();
    await listHandler()({ user: req.user }, res);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.accounts[0]).toMatchObject({ provider: 'google', providerEmail: 'u@gmail.com' });
    expect(JSON.stringify(payload)).not.toContain('access_token_encrypted');
  });

  test('POST connect without code initiates OAuth flow', async () => {
    const req = { user: { id: 'user-1' }, params: { provider: 'github' }, body: {}, headers: {}, ip: '127.0.0.1' };
    const res = makeRes();
    await connectHandler()(req, res);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.connectUrl).toContain('github.com');
    expect(payload.state).toHaveLength(48);
  });

  test('DELETE unknown id returns 404', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 'user-1' }, params: { id: 'missing' }, body: {} };
    const res = makeRes();
    await unlinkHandler()(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
