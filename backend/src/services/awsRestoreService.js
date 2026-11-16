'use strict';

const crypto = require('crypto');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const {
  ElasticBeanstalkClient,
  DescribeApplicationVersionsCommand,
  UpdateEnvironmentCommand,
} = require('@aws-sdk/client-elastic-beanstalk');
const {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} = require('@aws-sdk/client-cloudfront');

const RESTORE_POINT_LIMIT = 100;
const VERSION_BATCH_SIZE = 50;

function getConfig() {
  const config = {
    region: process.env.AWS_REGION,
    releaseBucket: process.env.AWS_RELEASES_BUCKET,
    applicationName: process.env.AWS_EB_APPLICATION_NAME,
    environmentName: process.env.AWS_EB_ENVIRONMENT_NAME,
    distributionId: process.env.AWS_FRONTEND_DISTRIBUTION_ID,
    frontendOriginId: process.env.AWS_FRONTEND_ORIGIN_ID || 'frontend-s3-origin',
  };
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'frontendOriginId' && !value)
    .map(([key]) => ({
      region: 'AWS_REGION',
      releaseBucket: 'AWS_RELEASES_BUCKET',
      applicationName: 'AWS_EB_APPLICATION_NAME',
      environmentName: 'AWS_EB_ENVIRONMENT_NAME',
      distributionId: 'AWS_FRONTEND_DISTRIBUTION_ID',
    })[key]);
  if (missing.length) {
    throw new Error(`Set the AWS restore settings: ${missing.join(', ')}.`);
  }
  return config;
}

function createClients(config) {
  return {
    s3: new S3Client({ region: config.region }),
    beanstalk: new ElasticBeanstalkClient({ region: config.region }),
    cloudFront: new CloudFrontClient({ region: config.region }),
  };
}

function isValidRestorePoint(value) {
  return Boolean(
    value &&
    /^[a-f\d]{7,64}$/i.test(value.commitSha || '') &&
    value.apiVersionLabel === `release-${value.commitSha}` &&
    value.frontendPrefix === `releases/${value.commitSha}/frontend` &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

async function readObjectText(body) {
  if (!body || typeof body.transformToString !== 'function') {
    throw new Error('AWS S3 returned a release manifest without a readable body.');
  }
  return body.transformToString();
}

async function listReleaseManifestKeys(s3, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'releases/',
      Delimiter: '/',
      ContinuationToken: continuationToken,
    }));
    for (const prefix of response.CommonPrefixes || []) {
      const key = `${prefix.Prefix}manifest.json`;
      if (prefix.Prefix) keys.push(key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (response.IsTruncated && !continuationToken) {
      throw new Error('AWS S3 marked release listing as truncated without a continuation token.');
    }
  } while (continuationToken);
  return keys;
}

async function readReleaseManifest(s3, bucket, key) {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  let manifest;
  try {
    manifest = JSON.parse(await readObjectText(Body));
  } catch (err) {
    throw new Error(`Could not read AWS release manifest "${key}": ${err.message}`);
  }
  if (!isValidRestorePoint(manifest)) {
    throw new Error(`AWS release manifest "${key}" has an invalid format or version.`);
  }
  if (key !== `releases/${manifest.commitSha}/manifest.json`) {
    throw new Error(`AWS release manifest "${key}" does not match its commit SHA.`);
  }
  return manifest;
}

async function listAvailableApiVersions(beanstalk, config, labels) {
  const available = new Set();
  if (!labels.length) return available;
  for (let offset = 0; offset < labels.length; offset += VERSION_BATCH_SIZE) {
    const response = await beanstalk.send(new DescribeApplicationVersionsCommand({
      ApplicationName: config.applicationName,
      VersionLabels: labels.slice(offset, offset + VERSION_BATCH_SIZE),
    }));
    for (const version of response.ApplicationVersions || []) {
      if (version.Status === 'PROCESSED') available.add(version.VersionLabel);
    }
  }
  return available;
}

async function getApplicationRestorePoints() {
  const config = getConfig();
  const { s3, beanstalk } = createClients(config);
  const keys = await listReleaseManifestKeys(s3, config.releaseBucket);
  const manifests = [];
  for (const key of keys) {
    manifests.push(await readReleaseManifest(s3, config.releaseBucket, key));
  }

  const availableVersions = await listAvailableApiVersions(
    beanstalk,
    config,
    manifests.map((manifest) => manifest.apiVersionLabel)
  );
  return manifests
    .filter((manifest) => availableVersions.has(manifest.apiVersionLabel))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
    .slice(0, RESTORE_POINT_LIMIT);
}

async function updateFrontend(cloudFront, config, frontendPrefix) {
  const current = await cloudFront.send(new GetDistributionConfigCommand({
    Id: config.distributionId,
  }));
  const distributionConfig = current.DistributionConfig;
  const origin = distributionConfig?.Origins?.Items?.find(
    (item) => item.Id === config.frontendOriginId
  );
  if (!origin) {
    throw new Error(`CloudFront distribution does not contain origin "${config.frontendOriginId}".`);
  }

  origin.OriginPath = `/${frontendPrefix}`;
  await cloudFront.send(new UpdateDistributionCommand({
    Id: config.distributionId,
    IfMatch: current.ETag,
    DistributionConfig: distributionConfig,
  }));
  await cloudFront.send(new CreateInvalidationCommand({
    DistributionId: config.distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}-${crypto.randomUUID()}`,
      Paths: { Quantity: 1, Items: ['/*'] },
    },
  }));
}

async function rollbackApplication({ commitSha }) {
  if (!/^[a-f\d]{7,64}$/i.test(commitSha || '')) {
    const error = new Error('Choose a valid AWS application restore point.');
    error.status = 400;
    throw error;
  }

  const config = getConfig();
  const points = await getApplicationRestorePoints();
  const point = points.find((candidate) => candidate.commitSha === commitSha);
  if (!point) {
    const error = new Error('That AWS application restore point is no longer available.');
    error.status = 404;
    throw error;
  }

  const { beanstalk, cloudFront } = createClients(config);
  const results = await Promise.allSettled([
    beanstalk.send(new UpdateEnvironmentCommand({
      ApplicationName: config.applicationName,
      EnvironmentName: config.environmentName,
      VersionLabel: point.apiVersionLabel,
    })),
    updateFrontend(cloudFront, config, point.frontendPrefix),
  ]);
  const components = ['backend API', 'frontend'];
  const succeeded = results
    .map((result, index) => result.status === 'fulfilled' ? components[index] : null)
    .filter(Boolean);
  const failures = results
    .map((result, index) => result.status === 'rejected'
      ? { component: components[index], message: result.reason.message }
      : null)
    .filter(Boolean);

  if (failures.length) {
    const error = new Error(
      failures.length === 2
        ? 'AWS could not start either application rollback.'
        : `AWS started only part of the application rollback. Failed: ${failures[0].component}.`
    );
    error.status = 502;
    error.succeeded = succeeded;
    error.failures = failures;
    throw error;
  }

  return {
    commitSha: point.commitSha,
    apiVersionLabel: point.apiVersionLabel,
    frontendPrefix: point.frontendPrefix,
    succeeded,
  };
}

module.exports = { getApplicationRestorePoints, rollbackApplication };
