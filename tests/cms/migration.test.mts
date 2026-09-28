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

test('career preview baseline adds a separate rollback batch and preserves legacy content', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-upgrade-'));
  const environment = { ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-local-baseline-rollback-only', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true' };
  const filename = path.join(dataDir, '.payload-local.db');
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up: careerUp } = await import('../../migrations/20260928_212105_career');
  const dialect = new SQLiteSyncDialect();
  let db = new DatabaseSync(filename);
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof initialUp>[0];
  try {
    await initialUp(args);
    await careerUp(args);
    db.exec(`
      INSERT INTO payload_migrations (id, name, batch, created_at, updated_at) VALUES
        (7, '20260917_195926_initial', 1, '2026-09-17T00:00:00Z', '2026-09-17T00:00:00Z'),
        (8, 'development', -1, '2026-09-28T00:00:00Z', '2026-09-28T00:00:00Z');
      INSERT INTO users (id, email) VALUES (1, 'legacy@example.invalid');
      INSERT INTO media (id, filename, width, height) VALUES (1, 'legacy.png', 100, 200);
      INSERT INTO home (id, _status) VALUES (1, 'published');
      INSERT INTO home_locales (title, _locale, _parent_id) VALUES ('Existing published home', 'en', 1), ('Existing Italian home', 'it', 1);
      INSERT INTO about (id, _status, photo_id) VALUES (1, 'published', 1);
      INSERT INTO about_locales (title, _locale, _parent_id) VALUES ('Existing about', 'en', 1), ('Existing Italian about', 'it', 1);
      INSERT INTO _about_v (id, version__status, version_photo_id, latest) VALUES (1, 'draft', 1, 1);
      INSERT INTO _about_v_locales (version_title, _locale, _parent_id) VALUES ('Existing English draft', 'en', 1), ('Existing private draft', 'it', 1);
      INSERT INTO career (id, _status) VALUES (1, 'published');
    `);
    const initial = db.prepare('SELECT * FROM payload_migrations WHERE id = 7').get();
    const content = () => ['users', 'media', 'home', 'home_locales', 'about', 'about_locales', '_about_v', '_about_v_locales'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const before = content();
    db.close();
    let baselineHistory;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: environment, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, 0, result.stderr);
      db = new DatabaseSync(filename);
      const history = db.prepare('SELECT * FROM payload_migrations ORDER BY id').all();
      assert.deepEqual(history.map((row) => row.name), ['20260917_195926_initial', '20260928_212105_career']);
      assert.deepEqual(history[0], initial);
      assert.equal(history[1].batch, 2);
      assert.deepEqual(content(), before);
      if (attempt === 0) baselineHistory = history;
      else assert.deepEqual(history, baselineHistory, 'Retry changed already baselined history');
      db.close();
    }
    const rollback = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate:down'], { env: environment, encoding: 'utf8', timeout: 30_000 });
    assert.equal(rollback.status, 0, `${rollback.stderr}\n${rollback.stdout}`);
    db = new DatabaseSync(filename);
    assert.deepEqual(content(), before, 'Career rollback changed legacy content');
    assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), [initial]);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('career', 'career_jobs', 'career_locales', '_career_v', '_career_v_version_jobs', '_career_v_locales')").all(), []);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { if (db.isOpen) db.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('career preview baseline rejects malformed migration prefixes and mismatched batches without mutation', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-invalid-prefix-'));
  const filename = path.join(dataDir, '.payload-local.db');
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up: careerUp } = await import('../../migrations/20260928_212105_career');
  const dialect = new SQLiteSyncDialect();
  let db = new DatabaseSync(filename);
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof initialUp>[0];
  try {
    await initialUp(args);
    await careerUp(args);
    db.exec("INSERT INTO home (id, _status) VALUES (1, 'published');");
    for (const { names, batch, lastBatch } of [
      { names: ['unknown'], batch: 1 },
      { names: ['20260928_212105_career', '20260917_195926_initial'], batch: 1 },
      { names: ['20260928_212105_career'], batch: 1 },
      { names: ['20260917_195926_initial', '20260917_195926_initial'], batch: 1 },
      { names: ['20260917_195926_initial', '20260928_212105_career', 'unknown'], batch: 1 },
      { names: ['20260917_195926_initial'], batch: 2 },
      { names: ['20260917_195926_initial'], batch: 0 },
      { names: ['20260917_195926_initial', '20260928_212105_career'], batch: 1, lastBatch: 3 },
      { names: ['20260917_195926_initial', '20260928_212105_career'], batch: 1, lastBatch: 0 },
    ]) {
      db.exec('DELETE FROM payload_migrations');
      for (const [index, name] of names.entries()) db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run(name, index > 0 ? lastBatch ?? batch : batch);
      db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, -1)').run('development');
      const history = db.prepare('SELECT * FROM payload_migrations ORDER BY id').all();
      const content = db.prepare('SELECT * FROM home').all();
      db.close();
      const refused = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: { ...process.env, PAYLOAD_DATA_DIR: dataDir }, encoding: 'utf8', timeout: 30_000 });
      assert.notEqual(refused.status, 0, `Accepted malformed history: ${names.join(', ')}`);
      assert.match(refused.stderr, /Unexpected migration history/);
      db = new DatabaseSync(filename);
      assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), history);
      assert.deepEqual(db.prepare('SELECT * FROM home').all(), content);
    }
  } finally { if (db.isOpen) db.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('career prefix baselining rejects unexpected history, objects, and index details without mutation', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up: careerUp } = await import('../../migrations/20260928_212105_career');
  const dialect = new SQLiteSyncDialect();
  for (const extra of [
    { label: 'unknown development batch', sql: "INSERT INTO payload_migrations (name, batch) VALUES ('unknown', -1)", error: /Unexpected migration history/ },
    { label: 'extra trigger', sql: "CREATE TRIGGER unexpected_career_guard BEFORE INSERT ON career_jobs BEGIN SELECT RAISE(ABORT, 'Blocked career write'); END", error: /Preview schema differs/ },
    { label: 'extra view', sql: 'CREATE VIEW unexpected_career_view AS SELECT * FROM career_jobs', error: /Preview schema differs/ },
    { label: 'descending index', sql: 'DROP INDEX career_jobs_order_idx; CREATE INDEX career_jobs_order_idx ON career_jobs (_order DESC)', error: /Preview schema differs/ },
    { label: 'index collation', sql: 'DROP INDEX career_jobs_order_idx; CREATE INDEX career_jobs_order_idx ON career_jobs (_order COLLATE NOCASE)', error: /Preview schema differs/ },
  ]) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-extra-'));
    const filename = path.join(dataDir, '.payload-local.db');
    let db = new DatabaseSync(filename);
    const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof initialUp>[0];
    try {
      await initialUp(args);
      await careerUp(args);
      db.exec(`
        INSERT INTO payload_migrations (name, batch) VALUES ('20260917_195926_initial', 1), ('development', -1);
        INSERT INTO home (id, _status) VALUES (1, 'published');
        INSERT INTO home_locales (title, _locale, _parent_id) VALUES ('Preserved home', 'en', 1);
        INSERT INTO career (id, _status) VALUES (1, 'published');
        INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role) VALUES (1, 1, 'en', 'amazon', 'work/amazon', 'Amazon', 'Software Development Engineer I');
      `);
      db.exec(extra.sql);
      const history = db.prepare('SELECT * FROM payload_migrations ORDER BY id').all();
      const content = () => ['home', 'home_locales', 'career', 'career_jobs'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
      const before = content();
      const objects = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
      db.close();
      const refused = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: { ...process.env, PAYLOAD_DATA_DIR: dataDir }, encoding: 'utf8', timeout: 30_000 });
      assert.notEqual(refused.status, 0, `Baselined ${extra.label}`);
      assert.match(refused.stderr, extra.error);
      db = new DatabaseSync(filename);
      assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), history);
      assert.deepEqual(content(), before);
      assert.deepEqual(db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all(), objects);
    } finally { if (db.isOpen) db.close(); await rm(dataDir, { recursive: true, force: true }); }
  }
});

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
