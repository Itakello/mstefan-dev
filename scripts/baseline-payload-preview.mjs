import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.PAYLOAD_DATA_DIR;
if (!dataDir || !path.isAbsolute(dataDir)) throw new Error('An absolute PAYLOAD_DATA_DIR is required. Run only against a stopped, backed-up copy of the preview volume.');
const filename = path.join(dataDir, '.payload-local.db');
if (!existsSync(filename) || !statSync(filename).isFile()) throw new Error('Preview database is missing.');
const referenceDir = mkdtempSync(path.join(tmpdir(), 'payload-baseline-'));
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
function schema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return { tables: tables.map(({ name }) => ({
    name,
    columns: db.prepare(`PRAGMA table_info(${quote(name)})`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    indexes: db.prepare(`PRAGMA index_list(${quote(name)})`).all().map(({ name: indexName, unique, origin, partial }) => ({
      name: indexName, unique, origin, partial,
      columns: db.prepare(`PRAGMA index_xinfo(${quote(indexName)})`).all(),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  })), objects: db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('view', 'trigger') ORDER BY type, name").all() };
}
let target;
let reference;
try {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { DatabaseSync } from 'node:sqlite';
    import { SQLiteSyncDialect } from '@payloadcms/db-sqlite/drizzle/sqlite-core';
    import { up as initialUp } from './migrations/20260917_195926_initial.ts';
    import { up as careerUp } from './migrations/20260928_212105_career.ts';
    import { up as branchUp } from './migrations/20260929_081759_career_branch_graph.ts';
    import { up as ongoingUp } from './migrations/20260929_160549_career_ongoing.ts';
    import path from 'node:path';
    const dialect = new SQLiteSyncDialect();
    for (const version of ['initial', 'career', 'branch_graph', 'ongoing']) {
      const db = new DatabaseSync(path.join(process.env.BASELINE_REFERENCE_DIR, version + '.db'));
      const args = { db: { run: (query) => db.exec(dialect.sqlToQuery(query).sql) } };
      await initialUp(args);
      db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run('20260917_195926_initial', 1);
      if (version !== 'initial') {
        await careerUp(args);
        db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run('20260928_212105_career', 1);
      }
      if (version === 'branch_graph' || version === 'ongoing') {
        await branchUp(args);
        db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run('20260929_081759_career_branch_graph', 1);
      }
      if (version === 'ongoing') {
        await ongoingUp(args);
        db.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run('20260929_160549_career_ongoing', 1);
      }
      db.close();
    }
  `], {
    env: { ...process.env, BASELINE_REFERENCE_DIR: referenceDir }, stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Reference schema migration failed.');
  target = new DatabaseSync(filename);
  target.exec('BEGIN EXCLUSIVE');
  assert.equal(target.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const targetSchema = schema(target);
  let migrations;
  for (const version of ['initial', 'career', 'branch_graph', 'ongoing']) {
    reference = new DatabaseSync(path.join(referenceDir, `${version}.db`), { readOnly: true });
    if (isDeepStrictEqual(targetSchema, schema(reference))) {
      migrations = reference.prepare('SELECT name, batch FROM payload_migrations ORDER BY id').all();
      break;
    }
    reference.close();
    reference = undefined;
  }
  assert.ok(migrations, 'Preview schema differs from the committed production migrations; refusing to baseline.');
  const existing = target.prepare('SELECT name, batch FROM payload_migrations ORDER BY id').all();
  const recorded = existing.filter(({ name, batch }) => !(['dev', 'development'].includes(name) && batch === -1));
  assert.deepEqual(recorded.map(({ name }) => name), migrations.slice(0, recorded.length).map(({ name }) => name),
    'Unexpected migration history; refusing to replace it.');
  assert.ok(recorded.every(({ batch }, index) => Number.isInteger(batch) && batch > 0 &&
    (index === 0 ? batch === 1 : batch === recorded[index - 1].batch || batch === recorded[index - 1].batch + 1)),
    'Unexpected migration history; refusing to replace it.');
  const nextBatch = recorded.length ? recorded[recorded.length - 1].batch + 1 : 1;
  for (const { name } of migrations.slice(recorded.length)) {
    target.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run(name, nextBatch);
  }
  target.prepare("DELETE FROM payload_migrations WHERE name IN ('dev', 'development') AND batch = -1").run();
  target.exec('COMMIT');
  console.log('Preview schema matches; matching production migrations recorded. Content and uploads are unchanged.');
} finally {
  target?.close();
  reference?.close();
  rmSync(referenceDir, { recursive: true, force: true });
}
