'use strict';

const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
const originalEvidenceEnvironment = {
  AWS_REGION: process.env.AWS_REGION,
  AWS_INCIDENT_EVIDENCE_BUCKET: process.env.AWS_INCIDENT_EVIDENCE_BUCKET,
};

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input, name: 'PutObjectCommand' })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input) => ({ input, name: 'DeleteObjectsCommand' })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input, name: 'GetObjectCommand' })),
  GetPublicAccessBlockCommand: jest.fn().mockImplementation((input) => ({ input, name: 'GetPublicAccessBlockCommand' })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args) => mockGetSignedUrl(...args),
}));

const {
  MAX_FILE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  validateImageFile,
  uploadIncidentEvidence,
  removeIncidentEvidence,
  createEvidenceSignedUrl,
} = require('./incidentEvidenceService');

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function makeFile(overrides = {}) {
  const buffer = overrides.buffer || png;
  return {
    originalname: 'screen.png',
    mimetype: 'image/png',
    buffer,
    size: buffer.length,
    ...overrides,
  };
}

beforeEach(() => {
  mockSend.mockReset().mockImplementation(async (command) => {
    if (command.name === 'GetPublicAccessBlockCommand') {
      return {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      };
    }
    return {};
  });
  mockGetSignedUrl.mockReset().mockResolvedValue('https://s3.example/signed');
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_INCIDENT_EVIDENCE_BUCKET = 'project-incident-evidence';
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEvidenceEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('accepts supported image signatures and sanitizes their display names', () => {
  expect(validateImageFile(makeFile({ originalname: '..\\..\\capture.png' }))).toMatchObject({
    fileName: 'capture.png',
    contentType: 'image/png',
    size: png.length,
    extension: 'png',
  });

  expect(validateImageFile(makeFile({
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    size: 4,
  }))).toMatchObject({ contentType: 'image/jpeg', extension: 'jpg' });

  expect(validateImageFile(makeFile({
    originalname: 'screen.webp',
    mimetype: 'image/webp',
    buffer: Buffer.from('RIFF0000WEBP'),
    size: 12,
  }))).toMatchObject({ contentType: 'image/webp', extension: 'webp' });
});

test.each([
  ['rejects a file with a mismatched image signature', makeFile({ buffer: Buffer.from('not an image') })],
  ['rejects unsupported image types', makeFile({ mimetype: 'image/gif' })],
  ['rejects screenshots over 5 MB', makeFile({ size: MAX_FILE_BYTES + 1 })],
])('%s', (_label, file) => {
  expect(() => validateImageFile(file)).toThrow();
});

test('uploads evidence to the configured private bucket with a generated object key', async () => {
  const uploaded = await uploadIncidentEvidence('incident-id', [makeFile()]);

  const putObject = mockSend.mock.calls.find(([command]) => command.name === 'PutObjectCommand')[0];
  expect(putObject.input).toMatchObject({
    Bucket: 'project-incident-evidence',
    Key: expect.stringMatching(/^incidents\/incident-id\/[0-9a-f-]+\.png$/),
    Body: png,
    ContentType: 'image/png',
    CacheControl: 'no-store',
  });
  expect(uploaded[0]).toMatchObject({
    fileName: 'screen.png',
    contentType: 'image/png',
    objectPath: expect.stringMatching(/^incidents\/incident-id\//),
  });
});

test('removes files already uploaded when a later file upload fails', async () => {
  mockSend.mockImplementation(async (command) => {
    if (command.name === 'GetPublicAccessBlockCommand') {
      return {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      };
    }
    if (command.name === 'PutObjectCommand' && mockSend.mock.calls.filter(
      ([entry]) => entry.name === 'PutObjectCommand'
    ).length > 1) {
      throw new Error('storage unavailable');
    }
    return {};
  });
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(uploadIncidentEvidence('incident-id', [makeFile(), makeFile()]))
    .rejects.toThrow('storage unavailable');

  const deleteCommand = mockSend.mock.calls.find(([command]) => command.name === 'DeleteObjectsCommand')[0];
  expect(deleteCommand.input.Bucket).toBe('project-incident-evidence');
  expect(deleteCommand.input.Delete.Objects).toHaveLength(1);
  expect(deleteCommand.input.Delete.Objects[0].Key).toMatch(/^incidents\/incident-id\//);
  logError.mockRestore();
});

test('does not upload when S3 public access is not fully blocked', async () => {
  mockSend.mockResolvedValueOnce({ PublicAccessBlockConfiguration: {} });
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(uploadIncidentEvidence('incident-id', [makeFile()]))
    .rejects.toThrow('must block public access');
  expect(mockSend.mock.calls.some(([command]) => command.name === 'PutObjectCommand')).toBe(false);
  logError.mockRestore();
});

test('creates short-lived signed links for private evidence', async () => {
  await expect(createEvidenceSignedUrl('incidents/incident-id/image.png'))
    .resolves.toBe('https://s3.example/signed');

  const [client, command, options] = mockGetSignedUrl.mock.calls[0];
  expect(command.input).toMatchObject({
    Bucket: 'project-incident-evidence',
    Key: 'incidents/incident-id/image.png',
    ResponseContentDisposition: 'inline',
  });
  expect(options).toEqual({ expiresIn: SIGNED_URL_TTL_SECONDS });
  expect(client.send).toBe(mockSend);
});

test('does not issue a signed link if S3 public access is not fully blocked', async () => {
  mockSend.mockResolvedValueOnce({ PublicAccessBlockConfiguration: {} });
  const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(createEvidenceSignedUrl('incidents/incident-id/image.png'))
    .rejects.toThrow('must block public access');
  expect(mockGetSignedUrl).not.toHaveBeenCalled();
  logError.mockRestore();
});