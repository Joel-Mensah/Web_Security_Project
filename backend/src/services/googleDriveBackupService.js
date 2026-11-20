'use strict';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

function getDriveConfig() {
  const { GOOGLE_DRIVE_CLIENT_ID: clientId, GOOGLE_DRIVE_CLIENT_SECRET: clientSecret,
    GOOGLE_DRIVE_REFRESH_TOKEN: refreshToken,
    GOOGLE_DRIVE_BACKUP_FOLDER_ID: folderId } = process.env;
  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new Error('For Google Drive backups, set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, and GOOGLE_DRIVE_BACKUP_FOLDER_ID.');
  }
  return { clientId, clientSecret, refreshToken, folderId };
}

async function getAccessToken(config) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Google Drive OAuth token request failed: ${data.error_description || data.error || response.statusText}`);
  }
  return data.access_token;
}

async function driveRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Google Drive request failed: ${body.error?.message || response.statusText}`);
  }
  return response.status === 204 ? null : response.json();
}

async function assertPrivateFolder(config, token) {
  const params = new URLSearchParams({ fields: 'id,mimeType,permissions(type,role)' });
  const folder = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(config.folderId)}?${params}`, token);
  if (folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_ID must identify a Google Drive folder.');
  }
  if ((folder.permissions || []).some(({ type }) => type === 'anyone' || type === 'domain')) {
    throw new Error('The Google Drive backup folder must not be shared publicly or with an entire domain.');
  }
}

async function uploadDriveBackup(name, encrypted) {
  const config = getDriveConfig();
  const token = await getAccessToken(config);
  await assertPrivateFolder(config, token);
  const boundary = `eab-${require('crypto').randomUUID()}`;
  const metadata = JSON.stringify({ name, mimeType: 'application/octet-stream', parents: [config.folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    encrypted,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  await driveRequest(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,size,createdTime`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function listDriveBackups() {
  const config = getDriveConfig();
  const token = await getAccessToken(config);
  await assertPrivateFolder(config, token);
  const query = `'${config.folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed = false and name contains 'database-backup-'`;
  let pageToken;
  const files = [];
  do {
    const params = new URLSearchParams({
      q: query,
      pageSize: '100',
      orderBy: 'createdTime desc',
      fields: 'nextPageToken,files(id,name,size,createdTime)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await driveRequest(`${DRIVE_API}/files?${params}`, token);
    files.push(...(result.files || []));
    pageToken = result.nextPageToken;
  } while (pageToken && files.length < 500);
  return files
    .filter((file) => file.id && /^database-backup-.+\.eab$/.test(file.name))
    .map((file) => ({ name: file.name, createdAt: file.createdTime, size: Number(file.size) || null }));
}

module.exports = { uploadDriveBackup, listDriveBackups };
