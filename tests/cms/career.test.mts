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
      assert.equal(seed.laneSpacing, 24);
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
      laneSpacing: 64,
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
    const university = { branchName: 'education/university', company: 'University', role: 'Student', color: '#12abcd', startDate: '2020-01-01', endDate: '2024-01-01' };
    const internship = { branchName: 'education/university/internship', parentBranchName: university.branchName, company: 'University', role: 'Intern', color: '#abcdef', startDate: '2022-01-01', endDate: '2023-01-01' };
    for (const jobs of [
      [university, university],
      [internship],
      [{ ...university, parentBranchName: internship.branchName }, internship],
      [university, { ...internship, endDate: '2025-01-01' }],
    ]) await assert.rejects(payload.updateGlobal({ slug: 'career', locale: 'en', data: { jobs } }));
    for (const laneSpacing of [17, 65, 24.5]) await assert.rejects(payload.updateGlobal({ slug: 'career', locale: 'en', data: { laneSpacing } }));
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: { laneSpacing: 18, jobs: [internship, university] } });
    await restart();
    const nestedDraft = await payload.findGlobal({ slug: 'career', locale: 'en', draft: true });
    assert.equal(nestedDraft.jobs![0].parentBranchName, university.branchName);
    assert.equal(nestedDraft.laneSpacing, 18);
    assert.equal((await payload.findGlobal({ slug: 'career', locale: 'en', draft: false })).laneSpacing, 24);
    assert.equal((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false })).laneSpacing, 24);
    assert.equal((await payload.findGlobal({ slug: 'career', locale: 'it', draft: true })).laneSpacing, 64);
    const current = { ...university, ongoing: true };
    const currentChild = { ...internship, ongoing: true };
    await assert.rejects(payload.updateGlobal({ slug: 'career', locale: 'en', data: { jobs: [university, currentChild] } }));
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: { jobs: [currentChild, current] } });
    await restart();
    const currentDraft = await payload.findGlobal({ slug: 'career', locale: 'en', draft: true });
    assert.ok(currentDraft.jobs!.every((job) => job.ongoing === true));
    assert.equal(currentDraft.jobs![0].parentBranchName, university.branchName);
    assert.equal((await payload.findGlobal({ slug: 'career', locale: 'en', draft: false })).jobs![0].ongoing, false);
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published' } });
    assert.ok((await payload.findGlobal({ slug: 'career', locale: 'en', draft: false })).jobs!.every((job) => job.ongoing === true));
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false })).jobs, publicItalian.jobs);
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { jobs: [], _status: 'published' } });
    await restart();
    const deleted = await payload.findGlobal({ slug: 'career', draft: true });
    assert.deepEqual(deleted.jobs ?? [], []);
    assert.deepEqual((await payload.findGlobal({ slug: 'career', locale: 'it', draft: false })).jobs, publicItalian.jobs);
    const mediaDB = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
    try {
      for (const id of [1, 2, 3, 4]) mediaDB.prepare('INSERT INTO media (id, filename, alt) VALUES (?, ?, ?)').run(id, `photo-${id}.png`, `Photo ${id}`);
    } finally { mediaDB.close(); }
    const visibleMedia = async () => {
      try { return (await payload.find({ collection: 'media', overrideAccess: false, limit: 20 })).docs.map(({ id }) => id).sort(); }
      catch (error) { if ((error as { status?: number }).status === 403) return []; throw error; }
    };
    assert.deepEqual(await visibleMedia(), []);
    const italianJobs = (await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false })).jobs!;
    await payload.updateGlobal({ slug: 'career', locale: 'it', publishSpecificLocale: 'it', data: {
      _status: 'published', jobs: italianJobs.map((job, index) => ({ ...job, summary: index === 0 ? 'Italian story' : job.summary, photo: index === 0 ? 2 : null })),
    } });
    assert.deepEqual(await visibleMedia(), [2], 'Published Italian career photo should be public');
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: {
      jobs: [{ branchName: 'work/draft', company: 'Draft', role: 'Draft role', summary: 'English story', color: '#123456', photo: 3 }],
    } });
    assert.deepEqual(await visibleMedia(), [2], 'Draft-only career photo should remain private');
    const draftPhoto = (await payload.findGlobal({ slug: 'career', locale: 'en', draft: true, depth: 1 })).jobs![0].photo;
    assert.equal(typeof draftPhoto === 'object' && draftPhoto?.alt, 'Photo 3');
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published' } });
    assert.deepEqual(await visibleMedia(), [2, 3]);
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: {
      _status: 'published', jobs: [{ branchName: 'work/photo-only', company: 'Photo only', role: 'Draft role', color: '#123456', photo: 4 }],
    } });
    assert.deepEqual(await visibleMedia(), [2], 'Photo-only experience keeps the main profile and its image private');
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: {
      _status: 'published', jobs: [{ branchName: 'work/draft', company: 'Draft', role: 'Draft role', summary: 'English story', color: '#123456', photo: 3 }],
    } });
    assert.deepEqual(await visibleMedia(), [2, 3]);
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: {
      jobs: [{ branchName: 'work/draft', company: 'Draft', role: 'Draft role', summary: 'English story', color: '#123456', photo: 4 }],
    } });
    assert.deepEqual(await visibleMedia(), [2, 3], 'Replacing a photo in a draft must not expose it');
    await payload.updateGlobal({ slug: 'about', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published', photo: 1 } });
    assert.deepEqual(await visibleMedia(), [1, 2, 3], 'Published About photo remains public');
    await payload.updateGlobal({ slug: 'about', locale: 'en', draft: true, data: { photo: 4 } });
    assert.deepEqual(await visibleMedia(), [1, 2, 3], 'Draft About photo remains private');
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published', jobs: [] } });
    assert.deepEqual(await visibleMedia(), [1, 2], 'Removed career photo should become private');
    const documentsDB = new DatabaseSync(path.join(dataDir, '.payload-local.db'));
    try {
      for (const id of [1, 2, 3]) documentsDB.prepare('INSERT INTO documents (id, filename, mime_type) VALUES (?, ?, ?)').run(id, `document-${id}.pdf`, 'application/pdf');
    } finally { documentsDB.close(); }
    const visibleDocuments = async () => {
      try { return (await payload.find({ collection: 'documents', overrideAccess: false, limit: 20 })).docs.map(({ id }) => id).sort(); }
      catch (error) { if ((error as { status?: number }).status === 403) return []; throw error; }
    };
    assert.deepEqual(await visibleDocuments(), []);
    const italianWithDocuments = (await payload.findGlobal({ slug: 'career', locale: 'it', draft: false, fallbackLocale: false })).jobs!;
    await payload.updateGlobal({ slug: 'career', locale: 'it', publishSpecificLocale: 'it', data: {
      _status: 'published', jobs: italianWithDocuments.map((job, index) => ({ ...job, documents: index === 0 ? [{ title: 'Documento italiano', file: 1 }] : [] })),
    } });
    assert.deepEqual(await visibleDocuments(), [1], 'Published Italian document should be public');
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: {
      jobs: [{ branchName: 'work/draft', company: 'Draft', role: 'Draft role', color: '#123456', documents: [{ title: 'Private PDF', file: 2 }] }],
    } });
    assert.deepEqual(await visibleDocuments(), [1], 'Draft-only document should remain private');
    const draftDocument = (await payload.findGlobal({ slug: 'career', locale: 'en', draft: true, depth: 1 })).jobs![0].documents![0];
    assert.equal(draftDocument.title, 'Private PDF');
    assert.equal(typeof draftDocument.file === 'object' && draftDocument.file?.mimeType, 'application/pdf');
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published' } });
    assert.deepEqual(await visibleDocuments(), [1, 2]);
    await payload.updateGlobal({ slug: 'career', locale: 'en', draft: true, data: {
      jobs: [{ branchName: 'work/draft', company: 'Draft', role: 'Draft role', color: '#123456', documents: [{ title: 'Replacement draft', file: 3 }] }],
    } });
    assert.deepEqual(await visibleDocuments(), [1, 2], 'Replacing a document in a draft must not expose it');
    await payload.updateGlobal({ slug: 'career', locale: 'en', publishSpecificLocale: 'en', data: { _status: 'published', jobs: [] } });
    assert.deepEqual(await visibleDocuments(), [1], 'Removed published document should become private');
  } finally {
    await payload.destroy();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('career photo migration preserves populated jobs and reverses only photo fields', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up: careerUp } = await import('../../migrations/20260928_212105_career');
  const { up: branchUp } = await import('../../migrations/20260929_081759_career_branch_graph');
  const { up: ongoingUp } = await import('../../migrations/20260929_160549_career_ongoing');
  const { up: photoUp, down: photoDown } = await import('../../migrations/20260929_205504_career_photo');
  const database = new DatabaseSync(':memory:');
  const dialect = new SQLiteSyncDialect();
  const args = { db: { run: (query: Parameters<typeof dialect.sqlToQuery>[0]) => database.exec(dialect.sqlToQuery(query).sql) } } as unknown as Parameters<typeof photoUp>[0];
  try {
    database.exec('PRAGMA foreign_keys = ON');
    for (const up of [initialUp, careerUp, branchUp, ongoingUp]) await up(args);
    database.exec(`
      INSERT INTO media (id, filename) VALUES (1, 'kept.png');
      INSERT INTO career (id, _status) VALUES (1, 'published');
      INSERT INTO career_jobs (_order, _parent_id, _locale, id, branch_name, company, role) VALUES (1, 1, 'en', 'one', 'work/amazon', 'Amazon', 'SDE I');
      INSERT INTO _career_v (id) VALUES (1);
      INSERT INTO _career_v_version_jobs (_order, _parent_id, _locale, id, branch_name, company, role) VALUES (1, 1, 'en', 1, 'work/amazon', 'Amazon', 'Private role');
    `);
    const before = ['media', 'career_jobs', '_career_v_version_jobs'].map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    await photoUp(args);
    assert.equal(database.prepare('SELECT photo_id FROM career_jobs').get()!.photo_id, null);
    assert.equal(database.prepare('SELECT photo_id FROM _career_v_version_jobs').get()!.photo_id, null);
    database.exec("UPDATE media SET alt = 'Portrait' WHERE id = 1; UPDATE career_jobs SET photo_id = 1; UPDATE _career_v_version_jobs SET photo_id = 1;");
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    await photoDown(args);
    assert.deepEqual(['media', 'career_jobs', '_career_v_version_jobs'].map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), before);
    assert.equal(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys, 1);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { database.close(); }
});

test('career migration preserves existing Home/About records and rolls back populated jobs with foreign keys enabled', async () => {
  const { SQLiteSyncDialect } = await import('@payloadcms/db-sqlite/drizzle/sqlite-core');
  const { up: initialUp } = await import('../../migrations/20260917_195926_initial');
  const { up, down } = await import('../../migrations/20260928_212105_career');
  const { up: branchUp, down: branchDown } = await import('../../migrations/20260929_081759_career_branch_graph');
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
    const beforeBranchMigration = database.prepare('SELECT * FROM career_jobs').all();
    await branchUp(args);
    assert.equal(database.prepare('SELECT lane_spacing FROM career_locales').get()!.lane_spacing, 24);
    database.exec("UPDATE career_jobs SET parent_branch_name = 'education/university'; UPDATE _career_v_version_jobs SET parent_branch_name = 'education/university';");
    assert.equal(database.prepare('SELECT company FROM career_jobs').get()!.company, 'Amazon');
    assert.equal(database.prepare('SELECT role FROM _career_v_version_jobs').get()!.role, 'Private role');
    await branchDown(args);
    assert.deepEqual(database.prepare('SELECT * FROM career_jobs').all(), beforeBranchMigration);
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
