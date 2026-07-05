import { isAbsolute, resolve } from 'node:path';

const production = process.env.NODE_ENV === 'production';
const root = resolve(import.meta.dirname, '../..');

export const runtimeConfig = {
  production,
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? resolve(root, 'data/wellnot.sqlite'),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
};

export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const required = ['ADMIN_INITIAL_PASSWORD', 'WORKER_INITIAL_PASSWORD', 'DATABASE_PATH'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`本番必須環境変数が未設定です: ${missing.join(', ')}`);
  if (!isAbsolute(env.DATABASE_PATH)) throw new Error('本番のDATABASE_PATHは絶対パスで指定してください');
  if (env.ADMIN_INITIAL_PASSWORD === 'wellnot-admin' || env.WORKER_INITIAL_PASSWORD === 'wellnot-worker') {
    throw new Error('本番では初期パスワードを既定値から変更してください');
  }
  if (env.PUBLIC_BASE_URL && !env.PUBLIC_BASE_URL.startsWith('https://')) throw new Error('PUBLIC_BASE_URLはhttps://で指定してください');
}

validateProductionConfig();
