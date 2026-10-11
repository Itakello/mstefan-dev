import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../../migrations/index';
import { planSharedAssets, up } from '../../migrations/20261011_132233_shared_career_media';

test('shared media migration preserves all original localized rows and version text, and maps titles by file identity', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const dialect = new SQLiteSyncDialect();
  const db = new DatabaseSync(':memory:');
  const args = { db: {
    run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => { const q = dialect.sqlToQuery(query); return db.prepare(q.sql).run(...q.params as never[]); },
    all: (query: Parameters<typeof dialect.sqlToQuery>[0]) => { const q = dialect.sqlToQuery(query); return db.prepare(q.sql).all(...q.params as never[]); },
  } } as unknown as Parameters<typeof up>[0];
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations.filter((migration) => !migration.name.includes('shared_career_media'))) await migration.up(args);
    db.exec(`INSERT INTO media (id, filename, alt) VALUES (1, 'published.png', 'Original portrait'), (2, 'draft.png', NULL);
      INSERT INTO documents (id, filename) VALUES (1, 'degree.pdf');
      INSERT INTO career (id, _status) VALUES (1, 'published');
      INSERT INTO _career_v (id, version__status, latest) VALUES (10, 'published', 0), (11, 'draft', 1);
      INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role, summary, photo_id)
        VALUES (1, 1, 'en', 'en', 'work/shared', 'Original', 'English role', 'Original English story', 1),
        (2, 1, 'it', 'it', 'work/shared', 'Originale', 'Ruolo italiano', 'Storia originale italiana', NULL);
      INSERT INTO career_jobs_documents (_order, _parent_id, _locale, id, title, file_id)
        VALUES (1, 'en', 'en', 'en-doc', 'Degree', 1), (1, 'it', 'it', 'it-doc', 'Laurea', 1);
      INSERT INTO _career_v_version_jobs (_order, _parent_id, _locale, id, branch_name, company, role, summary, photo_id)
        VALUES (1, 10, 'en', 1, 'work/shared', 'Original', 'English role', 'Historical English story', 1),
        (1, 10, 'it', 2, 'work/shared', 'Originale', 'Ruolo italiano', 'Storia italiana storica', NULL),
        (1, 11, 'en', 3, 'work/shared', 'Draft', 'Private role', 'Unpublished draft', 2);
      INSERT INTO _career_v_version_jobs_documents (_order, _parent_id, _locale, id, title, file_id)
        VALUES (1, 1, 'en', 1, 'Historical degree', 1), (1, 2, 'it', 2, 'Laurea storica', 1);`);
    const tables = ['career_jobs', 'career_jobs_documents', '_career_v', '_career_v_version_jobs', '_career_v_version_jobs_documents'];
    const original = tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    db.exec("UPDATE career_jobs SET photo_id=2 WHERE id='it'");
    await assert.rejects(up(args), /Conflicting career photos/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name='career_assets'").get()!.count, 0, 'Preflight conflicts must not change the schema');
    db.exec("UPDATE career_jobs SET photo_id=NULL WHERE id='it'");
    await up(args);
    assert.deepEqual(tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), original);
    assert.equal(db.prepare('SELECT photo_id FROM career_assets').get()!.photo_id, 1);
    assert.deepEqual(db.prepare('SELECT _parent_id, photo_id FROM _career_v_version_assets ORDER BY _parent_id').all().map((row) => [row._parent_id, row.photo_id]), [[10, 1], [11, 2]]);
    assert.deepEqual(db.prepare('SELECT _locale, title FROM career_assets_documents_locales ORDER BY _locale').all().map((row) => [row._locale, row.title]), [['en', 'Degree'], ['it', 'Laurea']]);
    assert.deepEqual(db.prepare('SELECT _locale, title FROM _career_v_version_assets_documents_locales ORDER BY _locale').all().map((row) => [row._locale, row.title]), [['en', 'Historical degree'], ['it', 'Laurea storica']]);
    assert.deepEqual(db.prepare("SELECT _locale, alt FROM media_locales WHERE _parent_id=1 ORDER BY _locale").all().map((row) => [row._locale, row.alt]), [['en', 'Original portrait'], ['it', 'Original portrait']]);
    assert.equal(db.prepare('SELECT alt FROM media WHERE id=1').get()!.alt, 'Original portrait', 'Original nonlocalized alt remains available');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('migration fails closed on conflicting photos, document order, missing branch identity, and duplicate file references', () => {
  const en = { id: 'en', _parent_id: 1, _locale: 'en', branch_name: 'work/shared', photo_id: 1 };
  const it = { ...en, id: 'it', _locale: 'it', photo_id: 2 };
  assert.throws(() => planSharedAssets([en, it], []), /Conflicting career photos/);
  assert.throws(() => planSharedAssets([{ ...en, branch_name: null }], []), /no stable branch name/);
  assert.throws(() => planSharedAssets([en, en], []), /Duplicate career branch/);
  const document = { id: 'doc', _parent_id: 'en', file_id: 1, title: 'English' };
  assert.throws(() => planSharedAssets([en], [document, document]), /Duplicate document/);
  assert.throws(() => planSharedAssets([en], [{ ...document, file_id: null }]), /Missing document file/);
  assert.throws(() => planSharedAssets([en, { ...it, photo_id: 1 }], [document, { ...document, _parent_id: 'it', file_id: 2 }]), /Conflicting career documents/);
});

test('populated migration history restarts without reseeding and exposes original revisions with shared media', { timeout: 60_000 }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-shared-media-history-'));
  Object.assign(process.env, { NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-shared-media-history-test-only-123', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true' });
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const dialect = new SQLiteSyncDialect();
  const database = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => database.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof up>[0];
  for (const migration of migrations.filter((migration) => !migration.name.includes('shared_career_media'))) {
    await migration.up(args);
    database.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, 1)').run(migration.name);
  }
  database.exec(`INSERT INTO media (id, filename) VALUES (1, 'original.png'), (2, 'draft.png');
    INSERT INTO career (id, _status) VALUES (1, 'published');
    INSERT INTO career_locales (_parent_id, _locale) VALUES (1, 'en'), (1, 'it');
    INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role, summary, photo_id)
      VALUES (1, 1, 'en', 'en', 'work/shared', 'Original', 'English role', 'Published English', 1),
      (1, 1, 'it', 'it', 'work/shared', 'Originale', 'Ruolo italiano', 'Italiano pubblicato', NULL);
    INSERT INTO _career_v (id, version__status, latest, created_at, updated_at)
      VALUES (10, 'published', 0, '2026-01-01', '2026-01-01'), (11, 'draft', 1, '2026-01-02', '2026-01-02');
    INSERT INTO _career_v_locales (_parent_id, _locale) VALUES (10, 'en'), (10, 'it'), (11, 'en'), (11, 'it');
    INSERT INTO _career_v_version_jobs (_order, _parent_id, _locale, id, _uuid, branch_name, company, role, summary, photo_id)
      VALUES (1, 10, 'en', 1, 'en', 'work/shared', 'Original', 'English role', 'Historical English', 1),
      (1, 10, 'it', 2, 'it', 'work/shared', 'Originale', 'Ruolo italiano', 'Italiano storico', NULL),
      (1, 11, 'en', 3, 'en', 'work/shared', 'Draft', 'Private role', 'Unpublished draft', 2),
      (1, 11, 'it', 4, 'it', 'work/shared', 'Originale', 'Ruolo italiano', 'Italiano privato', NULL);`);
  database.close();
  const { BasePayload } = await import('payload');
  const { default: config } = await import('../../payload.config');
  let payload = new BasePayload();
  try {
    for (let restart = 0; restart < 2; restart++) {
      const result = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: process.env, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, 0, result.stderr);
      await payload.init({ config });
      const { withCareerMedia } = await import('../../lib/cms/career-media');
      for (const locale of ['en', 'it'] as const) {
        const published = withCareerMedia(await payload.findGlobal({ slug: 'career', locale, draft: false, depth: 0 }));
        const draft = withCareerMedia(await payload.findGlobal({ slug: 'career', locale, draft: true, depth: 0 }));
        assert.equal(published.jobs![0].summary, locale === 'en' ? 'Published English' : 'Italiano pubblicato');
        assert.equal(draft.jobs![0].summary, locale === 'en' ? 'Unpublished draft' : 'Italiano privato');
        assert.equal(published.jobs![0].photo, 1);
        assert.equal(draft.jobs![0].photo, 2);
        const history = await payload.findGlobalVersions({ slug: 'career', locale, depth: 0, where: { id: { equals: 10 } } });
        assert.equal(history.docs.length, 1);
        const original = withCareerMedia(history.docs[0].version);
        assert.equal(original.jobs![0].summary, locale === 'en' ? 'Historical English' : 'Italiano storico');
        assert.equal(original.jobs![0].photo, 1);
      }
      await payload.destroy();
      payload = new BasePayload();
    }
  } finally { await payload.destroy(); await rm(dataDir, { recursive: true, force: true }); }
});
