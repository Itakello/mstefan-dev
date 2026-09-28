import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('career seed, localized order, authenticated drafts, colors, and deletion survive restarts', { timeout: 60_000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-career-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir,
    PAYLOAD_SECRET: 'disposable-local-career-integration-only', PAYLOAD_DISABLE_DEPENDENCY_CHECKER: 'true',
  });
  const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: process.env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(migration.status, 0, migration.stderr);
  const { BasePayload } = await import('payload');
  const { default: config } = await import('../../payload.config');
  let payload = new BasePayload();
  await payload.init({ config });
  const restart = async () => {
    await payload.destroy();
    payload = new BasePayload();
    await payload.init({ config });
  };
  try {
    for (const locale of ['en', 'it'] as const) {
      const seed = await payload.findGlobal({ slug: 'career', locale, fallbackLocale: false });
      assert.equal(seed._status, 'published');
      assert.equal(seed.mainlineColor, '#25b8f3');
      assert.equal(seed.jobs?.length, 1);
      assert.equal(seed.jobs![0].company, 'Amazon');
      assert.equal(seed.jobs![0].branchName, 'work/amazon');
      assert.equal(seed.jobs![0].role, 'Software Development Engineer I');
      for (const field of ['startDate', 'endDate', 'summary'] as const) assert.ok(!seed.jobs![0][field]);
    }
    const database = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM career_jobs').get()!.count, 2);
    database.close();
    await assert.rejects(payload.findGlobal({ slug: 'career', draft: true, overrideAccess: false }));
    await assert.rejects(payload.findGlobalVersions({ slug: 'career', overrideAccess: false }));
    await assert.rejects(payload.updateGlobal({ slug: 'career', overrideAccess: false, data: { jobs: [] } }));
    const user = await payload.create({ collection: 'users', data: { email: 'career-test@example.invalid', password: 'disposable-local-password-123' } });
    const originalItalian = await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false });
    const published = await payload.updateGlobal({
      slug: 'career', locale: 'en', publishSpecificLocale: 'en', overrideAccess: false, user,
      data: {
        mainlineColor: '#123ABC', _status: 'published', jobs: [
          { branchName: 'work/newer-employer', company: 'Newer employer', role: 'Newer role', summary: 'English summary', color: '#aB12Cd' },
          { branchName: 'work/amazon', company: 'Amazon', role: 'Software Development Engineer I', color: '#c77835' },
        ],
      },
    });
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false })).jobs, originalItalian.jobs);
    await payload.updateGlobal({
      slug: 'career', locale: 'it', publishSpecificLocale: 'it', overrideAccess: false, user,
      data: { _status: 'published', jobs: published.jobs!.map(({ id, ...job }, index) => ({ ...job, company: index ? 'Amazon' : 'Datore più recente', role: index ? 'Software Development Engineer I' : 'Ruolo più recente', summary: index ? null : 'Sintesi italiana' })) },
    });
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, user, overrideAccess: false, data: {
      jobs: published.jobs!.map((job, index) => ({ ...job, role: index ? job.role : 'Private draft role' })),
    } });
    await restart();
    const publicEnglish = await payload.findGlobal({ slug: 'career', locale: 'en', draft: false, fallbackLocale: false });
    const publicItalian = await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false });
    const draft = await payload.findGlobal({ slug: 'career', locale: 'en', draft: true, overrideAccess: false, user });
    assert.deepEqual(publicEnglish.jobs!.map((job) => job.role), ['Newer role', 'Software Development Engineer I']);
    assert.deepEqual(publicItalian.jobs!.map((job) => job.role), ['Ruolo più recente', 'Software Development Engineer I']);
    assert.equal(publicEnglish.jobs![0].summary, 'English summary');
    assert.equal(publicItalian.jobs![0].summary, 'Sintesi italiana');
    assert.equal(publicEnglish.mainlineColor, '#123ABC');
    assert.equal(publicEnglish.jobs![0].color, '#aB12Cd');
    assert.equal(draft.jobs![0].role, 'Private draft role');
    await payload.updateGlobal({ slug: 'career', locale: 'it', draft: true, data: {
      mainlineColor: '#fedcba',
      jobs: [...publicItalian.jobs!].reverse().map((job) => ({ ...job, color: '#112233', startDate: '2020-01-01T00:00:00.000Z' })),
    } });
    const reorderedItalian = await payload.findGlobal({ slug: 'career', locale: 'it', draft: true });
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published' } });
    const publishedDraft = await payload.findGlobal({ slug: 'career', locale: 'en', draft: false, fallbackLocale: false });
    assert.deepEqual(publishedDraft.jobs, draft.jobs);
    assert.equal(publishedDraft.mainlineColor, '#123ABC');
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false })).jobs, publicItalian.jobs);
    const preservedItalian = await payload.findGlobal({ slug: 'career', locale: 'it', draft: true });
    assert.deepEqual(preservedItalian.jobs, reorderedItalian.jobs);
    assert.equal(preservedItalian.mainlineColor, '#fedcba');
    await payload.updateGlobal({ slug: 'career', locale: 'it', draft: true, data: { jobs: reorderedItalian.jobs!.slice(0, 1) } });
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published' } });
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'en', draft: false })).jobs, publishedDraft.jobs);
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false })).jobs, publicItalian.jobs);
    assert.equal((await payload.findGlobal({ slug: 'career', locale: 'it', draft: true })).jobs!.length, 1);

    for (const data of [{ mainlineColor: 'red' }, { jobs: [{ branchName: 'invalid branch', company: 'Test', role: 'Test', color: '#abcdef' }] }, { jobs: [{ branchName: 'work/test', company: 'Test', role: 'Test', color: '#fff' }] }]) {
      await assert.rejects(payload.updateGlobal({ slug: 'career', locale: 'en', data }));
    }
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { jobs: [], _status: 'published' } });
    await restart();
    const deleted = await payload.findGlobal({ slug: 'career', draft: true });
    assert.deepEqual(deleted.jobs ?? [], []);
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false })).jobs, publicItalian.jobs);
  } finally {
    await payload.destroy();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('career migration preserves existing Home/About records and rolls back populated jobs with foreign keys enabled', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up, down } = await import('../../migrations/20260928_212105_career');
  const database = new DatabaseSync(':memory:');
  const dialect = new SQLiteSyncDialect();
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => database.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof up>[0];
  try {
    database.exec('PRAGMA foreign_keys = ON');
    await initialUp(args);
    database.exec(`
      INSERT INTO home (id, _status) VALUES (1, 'published');
      INSERT INTO home_locales (title, _locale, _parent_id) VALUES ('Kept home', 'en', 1);
      INSERT INTO about (id, _status) VALUES (1, 'published');
      INSERT INTO _about_v (id, version__status, latest) VALUES (1, 'draft', 1);
      INSERT INTO _about_v_locales (version_title, _locale, _parent_id) VALUES ('Kept private draft', 'it', 1);
    `);
    const tables = ['home', 'home_locales', 'about', '_about_v', '_about_v_locales'];
    const rows = () => tables.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const before = rows();
    await up(args);
    assert.deepEqual(rows(), before);
    database.exec(`
      INSERT INTO career (id, _status) VALUES (1, 'published');
      INSERT INTO career_jobs (_order, _parent_id, id, _locale, branch_name, company, role) VALUES (1, 1, 'job-one', 'en', 'work/amazon', 'Amazon', 'SDE I');
      INSERT INTO career_locales (mainline_color, _locale, _parent_id) VALUES ('#25b8f3', 'en', 1);
      INSERT INTO _career_v (id) VALUES (1);
      INSERT INTO _career_v_version_jobs (_order, _parent_id, id, _locale, company, role) VALUES (1, 1, 1, 'en', 'Amazon', 'Private role');
      INSERT INTO _career_v_locales (version_mainline_color, _locale, _parent_id) VALUES ('#25b8f3', 'en', 1);
    `);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    await down(args);
    assert.deepEqual(rows(), before);
    assert.equal(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    await up(args);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { database.close(); }
});


test('failed second-locale career initialization rolls back and retries both locales on restart', { timeout: 60_000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'payload-career-seed-recovery-'));
  Object.assign(process.env, { NODE_ENV: 'production', PAYLOAD_DATA_DIR: dataDir, PAYLOAD_SECRET: 'disposable-local-career-seed-recovery-only' });
  const migration = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { env: process.env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(migration.status, 0, migration.stderr);
  const { BasePayload } = await import('payload');
  const { default: configured } = await import('../../payload.config');
  const original = await configured;
  // The imported config belongs to the first test's deleted database; use a new adapter for this fixture.
  const { sqliteAdapter } = await import('@payloadcms/db-sqlite');
  const recoveryConfig = { ...original, db: sqliteAdapter({ client: { url: `file:${path.join(dataDir, '.payload-local.db')}` }, transactionOptions: {} }) };
  const failed = new BasePayload();
  try {
    await assert.rejects(failed.init({ config: Promise.resolve({ ...recoveryConfig, onInit: async (payload) => {
      const update = payload.updateGlobal.bind(payload);
      payload.updateGlobal = (async (args: Parameters<typeof update>[0]) => {
        if (args.slug === 'career' && args.locale === 'it') throw new Error('Injected second-locale seed failure');
        return update(args);
      }) as typeof update;
      await original.onInit!(payload);
    } }) }), /Injected second-locale seed failure/);
  } finally { await failed.destroy(); }
  const database = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM career').get()!.count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM career_jobs').get()!.count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM _career_v').get()!.count, 0);
  database.close();
  const restarted = new BasePayload();
  try {
    await restarted.init({ config: Promise.resolve(recoveryConfig) });
    for (const locale of ['en', 'it'] as const) {
      const career = await restarted.findGlobal({ slug: 'career', locale, fallbackLocale: false, draft: false });
      assert.equal(career._status, 'published');
      assert.equal(career.jobs?.length, 1);
      assert.equal(career.jobs![0].branchName, 'work/amazon');
    }
  } finally { await restarted.destroy(); await rm(dataDir, { recursive: true, force: true }); }
});
