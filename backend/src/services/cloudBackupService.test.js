'use strict';

const mockStorage = {
  getBucket: jest.fn(),
  upload: jest.fn(),
  list: jest.fn(),
};
const mockSupabase = {
  storage: {
    getBucket: mockStorage.getBucket,
    from: jest.fn(() => mockStorage),
  },
};
const mockCreateClient = jest.fn(() => mockSupabase);
const mockGetClient = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

jest.mock('../config/db', () => ({
  getClient: mockGetClient,
}));

const { createCloudBackup, listCloudBackups } = require('./cloudBackupService');

const envKeys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_BACKUP_BUCKET',
  'BACKUP_ENCRYPTION_KEY',
  'BACKUP_MAX_BYTES',
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUPABASE_BACKUP_BUCKET = 'private-backups';
  process.env.BACKUP_ENCRYPTION_KEY = 'a'.repeat(64);
  delete process.env.BACKUP_MAX_BYTES;

  mockCreateClient.mockClear();
  mockSupabase.storage.from.mockClear();
  mockStorage.getBucket.mockReset().mockResolvedValue({
    data: { public: false },
    error: null,
  });
  mockStorage.upload.mockReset().mockResolvedValue({ error: null });
  mockStorage.list.mockReset().mockResolvedValue({
    data: [
      { id: 'file-id', name: 'database-backup-2026-10-17.eab', created_at: '2026-10-17T00:00:00Z', metadata: { size: 1200 } },
      { id: null, name: 'folder', created_at: null, metadata: null },
      { id: 'other-id', name: 'avatar.png', created_at: '2026-10-17T00:00:00Z', metadata: { size: 50 } },
    ],
    error: null,
  });
  mockGetClient.mockReset().mockResolvedValue({
    query: jest.fn(async (text) => {
      if (text.startsWith('SELECT * FROM users')) {
        return { rows: [{ username: 'alice', password_hash: 'hash-secret' }] };
      }
      if (text.startsWith('SELECT * FROM incidents')) {
        return { rows: [{ title: 'Test incident' }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  });
});

afterAll(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('creates an encrypted consistent snapshot in the private Supabase bucket', async () => {
  const backup = await createCloudBackup();

  expect(mockStorage.getBucket).toHaveBeenCalledWith('private-backups');
  expect(mockStorage.upload).toHaveBeenCalledTimes(1);
  const [name, content, options] = mockStorage.upload.mock.calls[0];
  expect(name).toMatch(/^database-backup-.+\.eab$/);
  expect(Buffer.isBuffer(content)).toBe(true);
  expect(content.subarray(0, 4).toString()).toBe('EABK');
  expect(content.includes(Buffer.from('hash-secret'))).toBe(false);
  expect(options).toEqual(expect.objectContaining({
    contentType: 'application/octet-stream',
    upsert: false,
  }));
  expect(backup.tableCounts.users).toBe(1);
});

test('refuses to create a backup in a public bucket', async () => {
  mockStorage.getBucket.mockResolvedValue({
    data: { public: true },
    error: null,
  });

  await expect(createCloudBackup()).rejects.toThrow('must be private');
  expect(mockGetClient).not.toHaveBeenCalled();
  expect(mockStorage.upload).not.toHaveBeenCalled();
});

test('reports a Supabase URL configuration hint when Storage responds with HTML', async () => {
  mockStorage.getBucket.mockResolvedValue({
    data: null,
    error: { message: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` },
  });

  await expect(listCloudBackups()).rejects.toThrow(
    /Supabase Storage returned HTML instead of JSON.*Set SUPABASE_URL to the Supabase project URL/
  );
  expect(mockStorage.list).not.toHaveBeenCalled();
});

test('rejects a Vercel deployment URL as the Supabase project URL', async () => {
  process.env.SUPABASE_URL = 'https://enterprise-auth.vercel.app';

  await expect(listCloudBackups()).rejects.toThrow(
    'SUPABASE_URL points to a Vercel deployment'
  );
  expect(mockCreateClient).not.toHaveBeenCalled();
});

test('lists only backup files stored in the private bucket', async () => {
  const backups = await listCloudBackups();

  expect(backups).toEqual([{
    name: 'database-backup-2026-10-17.eab',
    createdAt: '2026-10-17T00:00:00Z',
    size: 1200,
  }]);
});
