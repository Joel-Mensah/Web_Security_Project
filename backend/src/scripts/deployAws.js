'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const archiver = require('archiver');
const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const {
  ElasticBeanstalkClient,
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  DescribeEnvironmentsCommand,
  UpdateEnvironmentCommand,
} = require('@aws-sdk/client-elastic-beanstalk');
const {
  CloudFrontClient,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} = require('@aws-sdk/client-cloudfront');

const backendDir = path.resolve(__dirname, '../..');
const root = path.resolve(backendDir, '..');
const frontendDir = path.join(root, 'frontend');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set before publishing an AWS release.`);
  return value;
}

function getReleaseConfig() {
  const commitSha = process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f\d]{40}$/i.test(commitSha)) {
    throw new Error('The release commit SHA must contain 40 hexadecimal characters.');
  }
  return {
    region: requiredEnv('AWS_REGION'),
    bucket: requiredEnv('AWS_RELEASES_BUCKET'),
    applicationName: requiredEnv('AWS_EB_APPLICATION_NAME'),
    environmentName: requiredEnv('AWS_EB_ENVIRONMENT_NAME'),
    distributionId: requiredEnv('AWS_FRONTEND_DISTRIBUTION_ID'),
    frontendOriginId: process.env.AWS_FRONTEND_ORIGIN_ID || 'frontend-s3-origin',
    commitSha: commitSha.toLowerCase(),
    apiVersionLabel: `release-${commitSha.toLowerCase()}`,
    frontendPrefix: `releases/${commitSha.toLowerCase()}/frontend`,
    backendBundleKey: `releases/${commitSha.toLowerCase()}/backend.zip`,
  };
}

function walkFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walkFiles(absolute, relative)
      : [{ absolute, relative }];
  });
}

async function uploadFrontend(s3, config) {
  const distDir = path.join(frontendDir, 'dist');
  const files = walkFiles(distDir);
  if (!files.some((file) => file.relative === 'index.html')) {
    throw new Error('The frontend build did not produce dist/index.html.');
  }

  for (const file of files) {
    const isHtml = path.extname(file.relative).toLowerCase() === '.html';
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: `${config.frontendPrefix}/${file.relative}`,
      Body: fs.createReadStream(file.absolute),
      ContentLength: fs.statSync(file.absolute).size,
      ContentType: mimeTypes[path.extname(file.relative).toLowerCase()] || 'application/octet-stream',
      CacheControl: isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
    }));
  }
}

async function createBackendBundle(config) {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-auth-aws-'));
  const bundlePath = path.join(stagingDir, 'backend.zip');
  const stageBackendDir = path.join(stagingDir, 'backend');
  fs.mkdirSync(stageBackendDir);
  fs.cpSync(path.join(backendDir, 'src'), path.join(stageBackendDir, 'src'), { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'server.js']) {
    fs.copyFileSync(path.join(backendDir, name), path.join(stageBackendDir, name));
  }

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(bundlePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(stageBackendDir, false);
      archive.finalize();
    });
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
  return { stagingDir, bundlePath, bundleKey: config.backendBundleKey };
}

async function waitForEnvironment(beanstalk, config) {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await beanstalk.send(new DescribeEnvironmentsCommand({
      ApplicationName: config.applicationName,
      EnvironmentNames: [config.environmentName],
      IncludeDeleted: false,
    }));
    const environment = response.Environments?.[0];
    if (!environment) throw new Error(`Elastic Beanstalk environment "${config.environmentName}" was not found.`);
    if (['Terminated', 'Terminating', 'Aborting'].includes(environment.EnvironmentStatus)) {
      throw new Error(`Elastic Beanstalk environment entered ${environment.EnvironmentStatus}.`);
    }
    if (environment.EnvironmentStatus === 'Ready' &&
        ['Red', 'Severe'].includes(environment.Health)) {
      throw new Error(`Elastic Beanstalk reported ${environment.Health} environment health.`);
    }
    if (environment.EnvironmentStatus === 'Ready' &&
        environment.VersionLabel === config.apiVersionLabel) {
      return;
    }
    await sleep(15_000);
  }
  throw new Error('Elastic Beanstalk did not finish the deployment within 15 minutes.');
}

async function waitForApplicationVersion(beanstalk, config) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await beanstalk.send(new DescribeApplicationVersionsCommand({
      ApplicationName: config.applicationName,
      VersionLabels: [config.apiVersionLabel],
    }));
    const version = response.ApplicationVersions?.[0];
    if (version?.Status === 'PROCESSED') return;
    if (version?.Status === 'FAILED') {
      throw new Error(`Elastic Beanstalk failed to process ${config.apiVersionLabel}.`);
    }
    await sleep(10_000);
  }
  throw new Error(`Elastic Beanstalk did not process ${config.apiVersionLabel} within 10 minutes.`);
}

async function waitForDistribution(cloudFront, distributionId) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await cloudFront.send(new GetDistributionCommand({ Id: distributionId }));
    if (response.Distribution?.Status === 'Deployed') return;
    await sleep(30_000);
  }
  throw new Error('CloudFront did not finish its previous configuration update within 30 minutes.');
}

async function activateFrontend(cloudFront, config) {
  await waitForDistribution(cloudFront, config.distributionId);
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
  origin.OriginPath = `/${config.frontendPrefix}`;
  await cloudFront.send(new UpdateDistributionCommand({
    Id: config.distributionId,
    IfMatch: current.ETag,
    DistributionConfig: distributionConfig,
  }));
  await cloudFront.send(new CreateInvalidationCommand({
    DistributionId: config.distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}-${config.commitSha}`,
      Paths: { Quantity: 1, Items: ['/*'] },
    },
  }));
}

async function deployAwsRelease() {
  const config = getReleaseConfig();
  const s3 = new S3Client({ region: config.region });
  const beanstalk = new ElasticBeanstalkClient({ region: config.region });
  const cloudFront = new CloudFrontClient({ region: config.region });
  const frontendApiUrl = process.env.VITE_API_URL || '/api';

  await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
  execFileSync(npmCommand, ['run', 'build'], {
    cwd: frontendDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: frontendApiUrl },
  });

  const bundle = await createBackendBundle(config);
  try {
    await uploadFrontend(s3, config);
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: bundle.bundleKey,
      Body: fs.createReadStream(bundle.bundlePath),
      ContentLength: fs.statSync(bundle.bundlePath).size,
      ContentType: 'application/zip',
    }));

    const existing = await beanstalk.send(new DescribeApplicationVersionsCommand({
      ApplicationName: config.applicationName,
      VersionLabels: [config.apiVersionLabel],
    }));
    if (!existing.ApplicationVersions?.some((version) => version.VersionLabel === config.apiVersionLabel)) {
      await beanstalk.send(new CreateApplicationVersionCommand({
        ApplicationName: config.applicationName,
        VersionLabel: config.apiVersionLabel,
        Description: `Git commit ${config.commitSha}`,
        SourceBundle: { S3Bucket: config.bucket, S3Key: bundle.bundleKey },
        Process: true,
      }));
    }

    await waitForApplicationVersion(beanstalk, config);
    await beanstalk.send(new UpdateEnvironmentCommand({
      ApplicationName: config.applicationName,
      EnvironmentName: config.environmentName,
      VersionLabel: config.apiVersionLabel,
    }));
    await waitForEnvironment(beanstalk, config);
    await activateFrontend(cloudFront, config);

    const manifest = {
      format: 'enterprise-auth-release',
      version: 1,
      commitSha: config.commitSha,
      apiVersionLabel: config.apiVersionLabel,
      frontendPrefix: config.frontendPrefix,
      createdAt: new Date().toISOString(),
    };
    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: `releases/${config.commitSha}/manifest.json`,
      Body: JSON.stringify(manifest),
      ContentType: 'application/json',
      CacheControl: 'no-store',
    }));
    console.log(`[AWS DEPLOY] Published application release ${config.commitSha}.`);
  } finally {
    fs.rmSync(bundle.stagingDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  deployAwsRelease().catch((error) => {
    console.error('[AWS DEPLOY] Release failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { deployAwsRelease };
