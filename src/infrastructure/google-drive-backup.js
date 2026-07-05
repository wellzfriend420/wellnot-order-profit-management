import { backup as sqliteBackup } from 'node:sqlite';
import { createSign } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runtimeConfig } from './runtime-config.js';

const status = { enabled: false, running: false, lastStartedAt: null, lastSucceededAt: null, lastError: null, lastFileId: null };
let timer;

const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function credentials() {
  const source = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!source) return null;
  const value = JSON.parse(source);
  if (!value.client_email || !value.private_key) throw new Error('GoogleサービスアカウントJSONが不正です');
  return value;
}

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claim = encode({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key.replace(/\\n/g, '\n')).toString('base64url')}`;
  const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google認証に失敗しました (${response.status})`);
  return (await response.json()).access_token;
}

async function upload(path, name, account) {
  const token = await accessToken(account);
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!folderId) throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_IDが未設定です');
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([await readFile(path)], { type: 'application/vnd.sqlite3' }), name);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,createdTime', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form,
  });
  if (!response.ok) throw new Error(`Google Driveへの保存に失敗しました (${response.status})`);
  return response.json();
}

export function backupStatus() { return { ...status }; }

export async function createDatabaseSnapshot(db, destination) {
  await sqliteBackup(db, destination);
  return destination;
}

export async function runGoogleDriveBackup(db) {
  if (status.running) throw new Error('バックアップは既に実行中です');
  const account = credentials();
  if (!account) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSONが未設定です');
  status.running = true;
  status.lastStartedAt = new Date().toISOString();
  status.lastError = null;
  const stamp = status.lastStartedAt.replace(/[:.]/g, '-');
  const name = `wellnot-${stamp}.sqlite`;
  const destination = resolve(tmpdir(), name);
  try {
    await createDatabaseSnapshot(db, destination);
    const uploaded = await upload(destination, name, account);
    status.lastSucceededAt = new Date().toISOString();
    status.lastFileId = uploaded.id;
    return uploaded;
  } catch (error) {
    status.lastError = error.message;
    throw error;
  } finally {
    status.running = false;
    await rm(destination, { force: true });
  }
}

export function startBackupScheduler(db) {
  const account = credentials();
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  status.enabled = Boolean(account && folderId);
  if (!status.enabled) {
    console.warn('Google Driveバックアップは未設定のため停止中です');
    return;
  }
  const intervalMs = Math.max(runtimeConfig.backupIntervalHours, 1) * 60 * 60 * 1000;
  const execute = () => runGoogleDriveBackup(db).catch((error) => console.error('Google Drive backup failed:', error.message));
  setTimeout(execute, 30_000).unref();
  timer = setInterval(execute, intervalMs);
  timer.unref();
}

export function stopBackupScheduler() { if (timer) clearInterval(timer); timer = undefined; }
