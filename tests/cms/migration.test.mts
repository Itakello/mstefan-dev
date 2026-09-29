import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

for (const schemaVersion of ['initial', 'career', 'branch_graph', 'ongoing', 'photo']) {
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
    INSERT INTO payload_migrations (name, batch) VALUES ('dev', -1);
  `);
  if (schemaVersion !== 'initial') {
    const { up: careerUp } = await import('../../migrations/20260928_212105_career');
    await careerUp({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof careerUp>[0]);
  }
  if (['branch_graph', 'ongoing', 'photo'].includes(schemaVersion)) {
    const { up: branchUp } = await import('../../migrations/20260929_081759_career_branch_graph');
    await branchUp({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof branchUp>[0]);
  }
  if (schemaVersion === 'ongoing' || schemaVersion === 'photo') {
    const { up: ongoingUp } = await import('../../migrations/20260929_160549_career_ongoing');
    await ongoingUp({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof ongoingUp>[0]);
    if (schemaVersion === 'photo') {
      const { up: photoUp } = await import('../../migrations/20260929_205504_career_photo');
      await photoUp({ db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof photoUp>[0]);
      db.exec("INSERT INTO media (id, filename, alt) VALUES (1, 'career.png', 'Career portrait')");
    }
    db.exec(`INSERT INTO career (id, _status) VALUES (1, 'published');
      INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role, start_date, ongoing${schemaVersion === 'photo' ? ', photo_id' : ''}) VALUES (1, 1, 'en', 'current', 'work/current', 'Current company', 'Engineer', '2024-01-01', 1${schemaVersion === 'photo' ? ', 1' : ''});
      INSERT INTO _career_v (id, version__status, latest) VALUES (1, 'draft', 1);
      INSERT INTO _career_v_version_jobs (_order, _parent_id, _locale, id, branch_name, company, role, start_date, ongoing${schemaVersion === 'photo' ? ', photo_id' : ''}) VALUES (1, 1, 'en', 1, 'work/current', 'Draft company', 'Engineer', '2024-01-01', 1${schemaVersion === 'photo' ? ', 1' : ''});`);
  }
  const careerRows = () => ['ongoing', 'photo'].includes(schemaVersion) ? ['career_jobs', '_career_v_version_jobs'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map((row) => { if (schemaVersion === 'ongoing') delete row.photo_id; return row; })) : [];
  const currentBefore = careerRows();
  const mediaBefore = schemaVersion === 'photo' ? db.prepare('SELECT * FROM media ORDER BY id').all() : [];
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
    assert.deepEqual(careerRows(), currentBefore);
    if (schemaVersion === 'photo') assert.deepEqual(db.prepare('SELECT * FROM media ORDER BY id').all(), mediaBefore);
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

test('branch graph preview baseline preserves populated published and draft fields and rolls back only its own batch', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-baseline-branch-graph-'));
  const environment = { ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-local-branch-baseline-only', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true' };
  const filename = path.join(dataDir, '.payload-local.db');
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up: careerUp } = await import('../../migrations/20260928_212105_career');
  const { up: branchUp } = await import('../../migrations/20260929_081759_career_branch_graph');
  const dialect = new SQLiteSyncDialect();
  let db = new DatabaseSync(filename);
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => db.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof initialUp>[0];
  const content = () => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'payload_migrations' ORDER BY name").all()
    .map(({ name }) => ({ name, rows: db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() }));
  try {
    await initialUp(args);
    await careerUp(args);
    db.exec(`
      INSERT INTO payload_migrations (id, name, batch, created_at, updated_at) VALUES
        (7, '20260917_195926_initial', 1, '2026-09-17T00:00:00Z', '2026-09-17T00:00:00Z'),
        (8, '20260928_212105_career', 1, '2026-09-28T00:00:00Z', '2026-09-28T00:00:00Z'),
        (9, 'development', -1, '2026-09-29T00:00:00Z', '2026-09-29T00:00:00Z');
      INSERT INTO users (id, email) VALUES (1, 'preserved@example.invalid');
      INSERT INTO media (id, filename, width, height) VALUES (1, 'preserved.png', 100, 200);
      INSERT INTO home (id, _status) VALUES (1, 'published');
      INSERT INTO home_locales (title, _locale, _parent_id) VALUES ('Existing home', 'en', 1);
      INSERT INTO about (id, _status, photo_id) VALUES (1, 'published', 1);
      INSERT INTO _about_v (id, version__status, version_photo_id, latest) VALUES (1, 'draft', 1, 1);
      INSERT INTO _about_v_locales (version_title, _locale, _parent_id) VALUES ('Existing private draft', 'it', 1);
      INSERT INTO career (id, _status) VALUES (1, 'published');
      INSERT INTO career_locales (id, mainline_color, _locale, _parent_id) VALUES (1, '#123456', 'en', 1), (2, '#654321', 'it', 1);
      INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role, summary, start_date, end_date, color) VALUES
        (1, 1, 'en', 'parent', 'work/parent', 'Parent company', 'Engineer', 'Published summary', '2024-01-01', '2024-12-31', '#123456'),
        (2, 1, 'en', 'child', 'work/child', 'Child company', 'Intern', 'Child summary', '2024-02-01', '2024-10-31', '#654321');
      INSERT INTO _career_v (id, version__status, latest) VALUES (1, 'draft', 1);
      INSERT INTO _career_v_locales (id, version_mainline_color, _locale, _parent_id) VALUES (1, '#abcdef', 'en', 1), (2, '#fedcba', 'it', 1);
      INSERT INTO _career_v_version_jobs (_order, _parent_id, _locale, id, branch_name, company, role, summary, start_date, end_date, color, _uuid) VALUES
        (1, 1, 'en', 1, 'work/parent', 'Draft parent', 'Engineer', 'Private parent summary', '2024-01-01', '2024-12-31', '#abcdef', 'parent'),
        (2, 1, 'en', 2, 'work/child', 'Draft child', 'Intern', 'Private child summary', '2024-02-01', '2024-10-31', '#fedcba', 'child');
    `);
    const prefix = db.prepare('SELECT * FROM payload_migrations WHERE batch = 1 ORDER BY id').all();
    const legacyContent = content();
    await branchUp(args);
    db.exec(`
      UPDATE career_jobs SET parent_branch_name = 'work/parent' WHERE id = 'child';
      UPDATE _career_v_version_jobs SET parent_branch_name = 'work/parent' WHERE id = 2;
      UPDATE career_locales SET lane_spacing = CASE _locale WHEN 'en' THEN 18 ELSE 64 END;
      UPDATE _career_v_locales SET version_lane_spacing = CASE _locale WHEN 'en' THEN 32 ELSE 48 END;
    `);
    const currentContent = content();
    db.close();
    let baselineHistory;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, ['scripts/baseline-payload-preview.mjs'], { env: environment, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, 0, result.stderr);
      db = new DatabaseSync(filename);
      const history = db.prepare('SELECT * FROM payload_migrations ORDER BY id').all();
      assert.deepEqual(history.slice(0, 2), prefix);
      assert.equal(history.length, 3);
      assert.equal(history[2].name, '20260929_081759_career_branch_graph');
      assert.equal(history[2].batch, 2);
      assert.deepEqual(content(), currentContent, 'Baseline changed populated publication or draft fields');
      if (attempt === 0) baselineHistory = history;
      else assert.deepEqual(history, baselineHistory, 'Rerun changed the matching production history');
      db.close();
    }
    const migrate = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: environment, encoding: 'utf8', timeout: 30_000 });
    assert.equal(migrate.status, 0, `${migrate.stderr}\n${migrate.stdout}`);
    db = new DatabaseSync(filename);
    assert.deepEqual(content().map((table) => ({ ...table, rows: table.rows.map((row) => {
      if (table.name === 'career_jobs' || table.name === '_career_v_version_jobs') { delete row.ongoing; delete row.photo_id; }
      if (table.name === 'media') delete row.alt;
      return row;
    }) })), currentContent, 'Migration after baseline changed existing branch fields');
    assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all().slice(0, 3), baselineHistory);
    db.close();
    const ongoingRollback = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate:down'], { env: environment, encoding: 'utf8', timeout: 30_000 });
    assert.equal(ongoingRollback.status, 0, `${ongoingRollback.stderr}\n${ongoingRollback.stdout}`);
    db = new DatabaseSync(filename);
    assert.deepEqual(content(), currentContent, 'Ongoing rollback changed existing branch fields');
    assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), baselineHistory);
    db.close();
    const rollback = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate:down'], { env: environment, encoding: 'utf8', timeout: 30_000 });
    assert.equal(rollback.status, 0, `${rollback.stderr}\n${rollback.stdout}`);
    db = new DatabaseSync(filename);
    assert.deepEqual(content(), legacyContent, 'Branch rollback changed legacy publication or draft content');
    assert.deepEqual(db.prepare('SELECT * FROM payload_migrations ORDER BY id').all(), prefix);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok');
  } finally { if (db.isOpen) db.close(); await rm(dataDir, { recursive: true, force: true }); }
});

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
        remainingMigrations = command === 'migrate' ? 5 : 0;
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
