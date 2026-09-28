import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

for (const schemaVersion of ['initial', 'career']) {
test(`preview ${schemaVersion} baseline preserves drafts and rejects unexpected schema`, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-test-'));
  const environment = { ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-local-integration-test-only', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true' };
  const filename = path.join(dataDir, '.payload-local.db');
  let db = new DatabaseSync(filename);
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up } = await import('../../migrations/20260917_195926_initial');
  const dialect = new SQLiteSyncDialect();
  await up({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof up>[0]);
  db.exec(`
    INSERT INTO about (id, _status) VALUES (1, 'published');
    INSERT INTO _about_v (id, version__status, latest) VALUES (1, 'draft', 1);
    INSERT INTO _about_v_locales (version_title, _locale, _parent_id) VALUES ('preserved-private-title', 'it', 1);
    INSERT INTO payload_migrations (name, batch) VALUES ('development', -1);
  `);
  if (schemaVersion === 'career') {
    const { up: careerUp } = await import('../../migrations/20260928_212105_career');
    await careerUp({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof careerUp>[0]);
  }
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
}

test('initial migration rolls back populated foreign-key relations and recreates its schema', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up, down } = await import('../../migrations/20260917_195926_initial');
  const dialect = new SQLiteSyncDialect();
  const database = new DatabaseSync(':memory:');
  const args = {
    db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => database.exec(dialect.sqlToQuery(query).sql) },
  } as unknown as Parameters<typeof up>[0];
  const schema = () => database.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  try {
    database.exec('PRAGMA foreign_keys = ON');
    assert.equal(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    await up(args);
    const originalSchema = schema();
    assert.ok(originalSchema.length > 0);
    database.exec(`
      INSERT INTO users (id, email) VALUES (1, 'migration@example.invalid');
      INSERT INTO media (id) VALUES (1);
      INSERT INTO payload_locked_documents (id) VALUES (1);
      INSERT INTO payload_locked_documents_rels (parent_id, path, users_id, media_id) VALUES (1, 'document', 1, 1);
      INSERT INTO payload_preferences (id) VALUES (1);
      INSERT INTO payload_preferences_rels (parent_id, path, users_id) VALUES (1, 'user', 1);
      INSERT INTO about (id, photo_id) VALUES (1, 1);
      INSERT INTO _about_v (id, version_photo_id) VALUES (1, 1);
    `);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    await down(args);
    assert.deepEqual(schema(), []);
    assert.equal(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    await up(args);
    assert.deepEqual(schema(), originalSchema);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    await down(args);
    assert.deepEqual(schema(), []);
  } finally { database.close(); }
});

test('Payload migration runner can remove and recreate the initial migration history', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-migration-roundtrip-'));
  const environment = {
    ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir,
    PAYLOAD_SECRET: 'disposable-local-migration-roundtrip-only',
    PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true',
  };
  try {
    let remainingMigrations = 0;
    for (const command of ['migrate', 'migrate:down', 'migrate']) {
      const result = spawnSync(process.execPath, ['node_modules/payload/bin.js', command], {
        env: environment, encoding: 'utf8', timeout: 30_000,
      });
      assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
      const database = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
      try {
        remainingMigrations = command === 'migrate' ? 2 : 0;
        if (remainingMigrations === 0) {
          assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all(), []);
        } else {
          assert.equal(database.prepare('SELECT COUNT(*) AS count FROM payload_migrations').get()!.count, remainingMigrations);
          assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
        }
      } finally { database.close(); }
    }
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
