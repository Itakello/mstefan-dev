import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.PAYLOAD_DATA_DIR;
if (!dataDir || !path.isAbsolute(dataDir)) throw new Error('An absolute PAYLOAD_DATA_DIR is required. Run only against a stopped, backed-up copy of the preview volume.');
const filename = path.join(dataDir, '.payload-local.db');
if (!existsSync(filename) || !statSync(filename).isFile()) throw new Error('Preview database is missing.');
const referenceDir = mkdtempSync(path.join(tmpdir(), 'payload-baseline-'));
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
function schema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(({ name }) => ({
    name,
    columns: db.prepare(`PRAGMA table_info(${quote(name)})`).all(),
    foreignKeys: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    indexes: db.prepare(`PRAGMA index_list(${quote(name)})`).all().map(({ name: indexName, unique, origin, partial }) => ({
      name: indexName, unique, origin, partial,
      columns: db.prepare(`PRAGMA index_info(${quote(indexName)})`).all(),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
let target;
let reference;
try {
  const result = spawnSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], {
    env: { ...process.env, NODE_ENV: 'production', PAYLOAD_DATA_DIR: referenceDir }, stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Reference schema migration failed.');
  reference = new DatabaseSync(path.join(referenceDir, '.payload-local.db'), { readOnly: true });
  target = new DatabaseSync(filename);
  target.exec('BEGIN EXCLUSIVE');
  assert.equal(target.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(schema(target), schema(reference), 'Preview schema differs from the initial production migration; refusing to baseline.');
  const migrations = reference.prepare('SELECT name, batch FROM payload_migrations ORDER BY id').all();
  const existing = target.prepare('SELECT name, batch FROM payload_migrations ORDER BY id').all();
  const recorded = existing.filter(({ batch }) => batch !== -1);
  if (recorded.length) {
    assert.deepEqual(recorded, migrations, 'Unexpected migration history; refusing to replace it.');
  } else {
    for (const { name, batch } of migrations) target.prepare('INSERT INTO payload_migrations (name, batch) VALUES (?, ?)').run(name, batch);
  }
  target.prepare('DELETE FROM payload_migrations WHERE batch = -1').run();
  target.exec('COMMIT');
  console.log('Preview schema matches; initial production migration recorded. Content and uploads are unchanged.');
} finally {
  target?.close();
  reference?.close();
  rmSync(referenceDir, { recursive: true, force: true });
}
