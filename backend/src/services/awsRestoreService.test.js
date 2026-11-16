'use strict';

const mockS3Send = jest.fn();
const mockBeanstalkSend = jest.fn();
const mockCloudFrontSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send(command) {
      return mockS3Send(command);
    }
  },
  ListObjectsV2Command: class {
    constructor(input) { this.input = input; }
  },
  GetObjectCommand: class {
    constructor(input) { this.input = input; }
  },
}));

jest.mock('@aws-sdk/client-elastic-beanstalk', () => ({
  ElasticBeanstalkClient: class {
    send(command) {
      return mockBeanstalkSend(command);
    }
  },
  DescribeApplicationVersionsCommand: class {
    constructor(input) { this.input = input; }
  },
  UpdateEnvironmentCommand: class {
    constructor(input) { this.input = input; }
  },
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class {
    send(command) {
      return mockCloudFrontSend(command);
    }
  },
  GetDistributionConfigCommand: class {
    constructor(input) { this.input = input; }
  },
  UpdateDistributionCommand: class {
    constructor(input) { this.input = input; }
  },
  CreateInvalidationCommand: class {
    constructor(input) { this.input = input; }
  },
}));

const {
  getApplicationRestorePoints,
  rollbackApplication,
} = require('./awsRestoreService');

const commitSha = '1234567890abcdef1234567890abcdef12345678';
const releaseManifest = {
  format: 'enterprise-auth-release',
  version: 1,
  commitSha,
  apiVersionLabel: `release-${commitSha}`,
  frontendPrefix: `releases/${commitSha}/frontend`,
  createdAt: '2026-10-16T12:00:00.000Z',
};
const awsEnvKeys = [
  'AWS_REGION',
  'AWS_RELEASES_BUCKET',
  'AWS_EB_APPLICATION_NAME',
  'AWS_EB_ENVIRONMENT_NAME',
  'AWS_FRONTEND_DISTRIBUTION_ID',
  'AWS_FRONTEND_ORIGIN_ID',
];
const originalEnv = Object.fromEntries(awsEnvKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_RELEASES_BUCKET = 'private-release-bucket';
  process.env.AWS_EB_APPLICATION_NAME = 'enterprise-auth';
  process.env.AWS_EB_ENVIRONMENT_NAME = 'enterprise-auth-prod';
  process.env.AWS_FRONTEND_DISTRIBUTION_ID = 'distribution-test';
  process.env.AWS_FRONTEND_ORIGIN_ID = 'frontend-s3-origin';

  mockS3Send.mockReset().mockImplementation((command) => {
    if (command.constructor.name === 'ListObjectsV2Command') {
      return Promise.resolve({
        CommonPrefixes: [{ Prefix: `releases/${commitSha}/` }],
        IsTruncated: false,
      });
    }
    if (command.constructor.name === 'GetObjectCommand') {
      return Promise.resolve({
        Body: { transformToString: async () => JSON.stringify(releaseManifest) },
      });
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`);
  });
  mockBeanstalkSend.mockReset().mockImplementation((command) => {
    if (command.constructor.name === 'DescribeApplicationVersionsCommand') {
      return Promise.resolve({
        ApplicationVersions: [{
          VersionLabel: `release-${commitSha}`,
          Status: 'PROCESSED',
        }],
      });
    }
    if (command.constructor.name === 'UpdateEnvironmentCommand') {
      return Promise.resolve({ EnvironmentName: 'enterprise-auth-prod' });
    }
    throw new Error(`Unexpected Elastic Beanstalk command: ${command.constructor.name}`);
  });
  mockCloudFrontSend.mockReset().mockImplementation((command) => {
    if (command.constructor.name === 'GetDistributionConfigCommand') {
      return Promise.resolve({
        ETag: 'etag-test',
        DistributionConfig: {
          Origins: {
            Items: [{ Id: 'frontend-s3-origin', OriginPath: '' }],
          },
        },
      });
    }
    return Promise.resolve({});
  });
});

afterAll(() => {
  for (const key of awsEnvKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('lists restore points only when their Elastic Beanstalk API version is available', async () => {
  const points = await getApplicationRestorePoints();

  expect(points).toEqual([releaseManifest]);
  expect(mockBeanstalkSend.mock.calls[0][0].input).toEqual({
    ApplicationName: 'enterprise-auth',
    VersionLabels: [`release-${commitSha}`],
  });
});

test('rolls back the API version and CloudFront frontend origin for one release', async () => {
  await expect(rollbackApplication({ commitSha })).resolves.toEqual({
    commitSha,
    apiVersionLabel: `release-${commitSha}`,
    frontendPrefix: `releases/${commitSha}/frontend`,
    succeeded: ['backend API', 'frontend'],
  });

  const apiRollback = mockBeanstalkSend.mock.calls
    .map(([command]) => command)
    .find((command) => command.constructor.name === 'UpdateEnvironmentCommand');
  expect(apiRollback.input).toEqual({
    ApplicationName: 'enterprise-auth',
    EnvironmentName: 'enterprise-auth-prod',
    VersionLabel: `release-${commitSha}`,
  });

  const distributionUpdate = mockCloudFrontSend.mock.calls
    .map(([command]) => command)
    .find((command) => command.constructor.name === 'UpdateDistributionCommand');
  expect(distributionUpdate.input.IfMatch).toBe('etag-test');
  expect(distributionUpdate.input.DistributionConfig.Origins.Items[0].OriginPath)
    .toBe(`/releases/${commitSha}/frontend`);
  expect(mockCloudFrontSend.mock.calls.some(([command]) =>
    command.constructor.name === 'CreateInvalidationCommand'
  )).toBe(true);
});

test('rejects restore point IDs that were not published', async () => {
  await expect(rollbackApplication({ commitSha: 'abcdef1234567' }))
    .rejects.toMatchObject({ status: 404 });
  expect(mockBeanstalkSend.mock.calls.some(([command]) =>
    command.constructor.name === 'UpdateEnvironmentCommand'
  )).toBe(false);
  expect(mockCloudFrontSend).not.toHaveBeenCalled();
});

test('reports a partial rollback when AWS fails to update the frontend', async () => {
  mockCloudFrontSend.mockImplementation(async (command) => {
    if (command.constructor.name === 'GetDistributionConfigCommand') {
      throw new Error('CloudFront unavailable');
    }
    return {};
  });

  await expect(rollbackApplication({ commitSha })).rejects.toMatchObject({
    status: 502,
    succeeded: ['backend API'],
    failures: [{ component: 'frontend', message: 'CloudFront unavailable' }],
  });
});
