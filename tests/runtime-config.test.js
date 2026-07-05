import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfig } from '../src/infrastructure/runtime-config.js';

test('本番では永続DBと初期パスワードを必須にする', () => {
  assert.throws(() => validateProductionConfig({ NODE_ENV: 'production' }), /本番必須環境変数/);
  assert.throws(() => validateProductionConfig({
    NODE_ENV: 'production', DATABASE_PATH: 'data/app.sqlite', ADMIN_INITIAL_PASSWORD: 'long-admin', WORKER_INITIAL_PASSWORD: 'long-worker',
  }), /絶対パス/);
  assert.doesNotThrow(() => validateProductionConfig({
    NODE_ENV: 'production', DATABASE_PATH: '/var/data/wellnot/wellnot.sqlite', ADMIN_INITIAL_PASSWORD: 'long-admin', WORKER_INITIAL_PASSWORD: 'long-worker', PUBLIC_BASE_URL: 'https://example.invalid',
  }));
});
