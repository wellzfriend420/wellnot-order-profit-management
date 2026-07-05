import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabaseSnapshot } from '../src/infrastructure/google-drive-backup.js';

test('稼働中SQLiteから整合性のあるバックアップを作成する', async () => {
  const directory = resolve('.test-data', `backup-${process.pid}`);
  mkdirSync(directory, { recursive: true });
  const sourcePath = resolve(directory, 'source.sqlite');
  const backupPath = resolve(directory, 'backup.sqlite');
  const source = new DatabaseSync(sourcePath);
  try {
    source.exec('CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES (\'保存確認\')');
    await createDatabaseSnapshot(source, backupPath);
    const restored = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT value FROM sample').get().value, '保存確認');
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally { restored.close(); }
  } finally {
    source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
