import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('preview baseline preserves drafts and rejects unexpected schema', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-test-'));
  const environment = { ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-local-integration-test-only', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true' };
  Object.assign(process.env, environment, { NODE_ENV: 'development' });
  const { getPayload } = await import('payload');
  const { default: config } = await import('../../payload.config');
  const payload = await getPayload({ config });
  await payload.updateGlobal({ slug: 'about', locale: 'it', draft: true, data: { title: 'preserved-private-title' } });
  await payload.destroy();
  const filename = path.join(dataDir, '.payload-local.db');
  let db = new DatabaseSync(filename);
  const before = db.prepare('SELECT * FROM _about_v_locales ORDER BY id').all();
  db.close();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const baseline = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: environment, encoding: 'utf8' });
      assert.equal(baseline.status, 0, baseline.stderr);
    }
    const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: environment, encoding: 'utf8' });
    assert.equal(migration.status, 0, migration.stderr);
    db = new DatabaseSync(filename);
    assert.deepEqual(db.prepare('SELECT * FROM _about_v_locales ORDER BY id').all(), before);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM payload_migrations WHERE batch = -1').get()!.count, 0);
    db.exec('ALTER TABLE about ADD COLUMN unexpected_schema TEXT');
    const migrationHistory = db.prepare('SELECT * FROM payload_migrations ORDER BY id').all();
    db.close();
    const refused = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: environment, encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
    db = new DatabaseSync(filename);
    assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), migrationHistory);
    db.close();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
