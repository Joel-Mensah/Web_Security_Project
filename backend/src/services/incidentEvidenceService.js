'use strict';

const crypto = require('crypto');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  GetPublicAccessBlockCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const SIGNED_URL_TTL_SECONDS = 60;
const IMAGE_FORMATS = {
  'image/jpeg': {
    extension: 'jpg',
    matches: (buffer) => buffer.length >= 4
      && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    matches: (buffer) => buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/webp': {
    extension: 'webp',
    matches: (buffer) => buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

function invalidEvidence(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateImageFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw invalidEvidence('Evidence must be an uploaded image file.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw invalidEvidence('Each screenshot must be 5 MB or smaller.');
  }
  const format = IMAGE_FORMATS[file.mimetype];
  if (!format || !format.matches(file.buffer)) {
    throw invalidEvidence('Evidence must be a valid PNG, JPEG, or WebP image.');
  }

  const originalName = path.basename(String(file.originalname || '').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
  return {
    id: crypto.randomUUID(),
    fileName: originalName || `evidence.${format.extension}`,
    contentType: file.mimetype,
    size: file.size,
    extension: format.extension,
  };
}

function getEvidenceConfig() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const bucket = process.env.AWS_INCIDENT_EVIDENCE_BUCKET;
  if (!bucket) {
    throw new Error('Set AWS_INCIDENT_EVIDENCE_BUCKET to the private S3 evidence bucket name.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..')) {
    throw new Error('AWS_INCIDENT_EVIDENCE_BUCKET must be a valid S3 bucket name.');
  }
  return { client: new S3Client({ region }), bucket };
}

async function requirePrivateBucket(client, bucket) {
  const accessBlock = await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
  const block = accessBlock.PublicAccessBlockConfiguration;
  if (
    !block?.BlockPublicAcls ||
    !block?.IgnorePublicAcls ||
    !block?.BlockPublicPolicy ||
    !block?.RestrictPublicBuckets
  ) {
    throw new Error(`Incident evidence bucket "${bucket}" must block public access.`);
  }
}

async function uploadIncidentEvidence(incidentId, files) {
  const validated = files.map((file) => validateImageFile(file));
  if (!validated.length) return [];

  const { client, bucket } = getEvidenceConfig();
  await requirePrivateBucket(client, bucket);
  const uploaded = [];
  try {
    for (let index = 0; index < validated.length; index += 1) {
      const evidence = validated[index];
      const objectPath = `incidents/${incidentId}/${evidence.id}.${evidence.extension}`;
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectPath,
        Body: files[index].buffer,
        ContentLength: evidence.size,
        ContentType: evidence.contentType,
        CacheControl: 'no-store',
      }));
      uploaded.push({ ...evidence, objectPath });
    }
    return uploaded;
  } catch (err) {
    await removeIncidentEvidence(uploaded).catch((cleanupError) => {
      console.error('[INCIDENT EVIDENCE] Upload cleanup failed:', cleanupError.message);
    });
    throw err;
  }
}

async function removeIncidentEvidence(evidence) {
  if (!evidence.length) return;
  const { client, bucket } = getEvidenceConfig();
  const result = await client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: evidence.map((item) => ({ Key: item.objectPath })),
      Quiet: true,
    },
  }));
  if (result.Errors?.length) {
    throw new Error(`Could not remove incomplete incident evidence: ${result.Errors[0].Message}`);
  }
}

async function createEvidenceSignedUrl(objectPath) {
  const { client, bucket } = getEvidenceConfig();
  await requirePrivateBucket(client, bucket);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: objectPath,
      ResponseContentDisposition: 'inline',
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_FILES,
  SIGNED_URL_TTL_SECONDS,
  invalidEvidence,
  validateImageFile,
  uploadIncidentEvidence,
  removeIncidentEvidence,
  createEvidenceSignedUrl,
};