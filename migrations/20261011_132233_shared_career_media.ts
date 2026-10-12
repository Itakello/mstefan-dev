import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Validate every snapshot before schema changes; retain original rows for historical evidence.
  const jobs = await db.all<Row>(sql`SELECT * FROM career_jobs ORDER BY _parent_id, _order`);
  const versionJobs = await db.all<Row>(sql`SELECT * FROM _career_v_version_jobs ORDER BY _parent_id, _order`);
  const published = planSharedAssets(normalizeAmazonPhotos(jobs),
    await db.all(sql`SELECT * FROM career_jobs_documents ORDER BY _parent_id, _order`));
  const versions = planSharedAssets(normalizeAmazonPhotos(versionJobs),
    await db.all(sql`SELECT * FROM _career_v_version_jobs_documents ORDER BY _parent_id, _order`));
  if ([...jobs, ...versionJobs].some((job) => job.branch_name === 'work/amazon' && job.photo_id != null)) {
    await verifyAmazonPhotos(await db.all(sql`SELECT id, filename FROM media WHERE id IN (1, 2)`));
  }
  await db.run(sql`CREATE TABLE \`career_assets_documents\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`file_id\` integer,
    FOREIGN KEY (\`file_id\`) REFERENCES \`documents\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`career_assets\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`career_assets_documents_order_idx\` ON \`career_assets_documents\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`career_assets_documents_parent_id_idx\` ON \`career_assets_documents\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`career_assets_documents_file_idx\` ON \`career_assets_documents\` (\`file_id\`);`)
  await db.run(sql`CREATE TABLE \`career_assets_documents_locales\` (
    \`title\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`_locale\` text NOT NULL,
    \`_parent_id\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`career_assets_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`career_assets_documents_locales_locale_parent_id_unique\` ON \`career_assets_documents_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`career_assets\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`branch_name\` text,
    \`photo_id\` integer,
    FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`career\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`career_assets_order_idx\` ON \`career_assets\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`career_assets_parent_id_idx\` ON \`career_assets\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`career_assets_photo_idx\` ON \`career_assets\` (\`photo_id\`);`)
  await db.run(sql`CREATE TABLE \`_career_v_version_assets_documents\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`file_id\` integer,
    \`_uuid\` text,
    FOREIGN KEY (\`file_id\`) REFERENCES \`documents\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v_version_assets\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_documents_order_idx\` ON \`_career_v_version_assets_documents\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_documents_parent_id_idx\` ON \`_career_v_version_assets_documents\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_documents_file_idx\` ON \`_career_v_version_assets_documents\` (\`file_id\`);`)
  await db.run(sql`CREATE TABLE \`_career_v_version_assets_documents_locales\` (
    \`title\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`_locale\` text NOT NULL,
    \`_parent_id\` integer NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v_version_assets_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_career_v_version_assets_documents_locales_locale_parent_id_\` ON \`_career_v_version_assets_documents_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_career_v_version_assets\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`branch_name\` text,
    \`photo_id\` integer,
    \`_uuid\` text,
    FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_order_idx\` ON \`_career_v_version_assets\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_parent_id_idx\` ON \`_career_v_version_assets\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_assets_photo_idx\` ON \`_career_v_version_assets\` (\`photo_id\`);`)
  await db.run(sql`CREATE TABLE \`media_locales\` (
    \`alt\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`_locale\` text NOT NULL,
    \`_parent_id\` integer NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_locales_locale_parent_id_unique\` ON \`media_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`INSERT INTO media_locales (alt, _locale, _parent_id) SELECT alt, 'en', id FROM media`);
  await db.run(sql`INSERT INTO media_locales (alt, _locale, _parent_id) SELECT alt, 'it', id FROM media`);
  await writeSharedAssets(db, published, false);
  await writeSharedAssets(db, versions, true);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const entries = await db.all(sql`SELECT id FROM career_assets UNION ALL SELECT id FROM _career_v_version_assets`);
  const changedAlt = await db.all(sql`SELECT media_locales.id FROM media_locales JOIN media ON media.id=media_locales._parent_id WHERE media_locales.alt IS NOT media.alt`);
  if (entries.length || changedAlt.length) throw new Error('Shared career media rollback requires restoring the pre-migration backup; legacy references do not contain later shared media edits.');
  for (const table of ['career_assets_documents_locales', 'career_assets_documents', 'career_assets', '_career_v_version_assets_documents_locales', '_career_v_version_assets_documents', '_career_v_version_assets', 'media_locales']) {
    await db.run(sql`DROP TABLE ${sql.identifier(table)}`);
  }
}

type Row = Record<string, unknown>;
type SharedAsset = { parent: number; branchName: string; photo: number | null; documents: { file: number; titles: Record<string, string | null> }[] };

export function normalizeAmazonPhotos(jobs: Row[]): Row[] {
  return jobs.map((job) => {
    if (job.branch_name !== 'work/amazon') return job;
    if (job.photo_id != null && job.photo_id !== 1 && job.photo_id !== 2) {
      throw new Error(`Unexpected Amazon photo in snapshot ${job._parent_id}.`);
    }
    return { ...job, photo_id: job.photo_id === 2 ? 1 : job.photo_id };
  });
}

async function verifyAmazonPhotos(media: Row[]) {
  const dataDir = path.resolve(process.env.PAYLOAD_DATA_DIR || path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  const uploadDir = path.join(dataDir, '.payload-media');
  for (const directory of [dataDir, uploadDir]) {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe Amazon upload directory.');
  }
  for (const [id, length, digest] of [
    [1, 519689, '775cf00360e9afdb0602a042401e9d4fd6b3126d7f71f2c3584e9aa5a601ed85'],
    [2, 244090, 'ff3bb370ebf73912c2bef8861bb5276e40e9d2b207922d2048154ee688d45c9b'],
  ] as const) {
    const rows = media.filter((row) => row.id === id);
    const filename = rows[0]?.filename;
    if (rows.length !== 1 || typeof filename !== 'string' || !filename || path.basename(filename) !== filename || filename === '.' || filename === '..') throw new Error('Unexpected Amazon media identity.');
    const file = path.join(uploadDir, filename);
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Unsafe Amazon upload file.');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== metadata.ino || opened.dev !== metadata.dev) throw new Error('Amazon upload identity changed.');
      const bytes = await handle.readFile();
      if (bytes.length !== length || createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Amazon upload identity mismatch.');
    } finally { await handle.close(); }
  }
}

export function planSharedAssets(jobs: Row[], documents: Row[]): SharedAsset[] {
  const grouped = new Map<string, Row[]>();
  for (const job of jobs) {
    if (typeof job.branch_name !== 'string' || !job.branch_name.trim()) {
      if (job.photo_id != null || documents.some((document) => document._parent_id === job.id)) {
        throw new Error(`Career media has no stable branch name in snapshot ${job._parent_id}.`);
      }
      continue;
    }
    const key = JSON.stringify([job._parent_id, job.branch_name]);
    grouped.set(key, [...(grouped.get(key) ?? []), job]);
  }
  return [...grouped.values()].map((rows) => {
    const first = rows[0];
    const context = `snapshot ${first._parent_id}, branch ${first.branch_name}`;
    if (new Set(rows.map((row) => row._locale)).size !== rows.length) throw new Error(`Duplicate career branch in ${context}.`);
    const photos = new Set(rows.map((row) => row.photo_id).filter((id) => id != null));
    if (photos.size > 1) throw new Error(`Conflicting career photos in ${context}. Resolve references before migration.`);
    let files: number[] | undefined;
    const titles = new Map<number, Record<string, string | null>>();
    for (const row of rows) {
      const docs = documents.filter((document) => document._parent_id === row.id);
      if (docs.some((doc) => typeof doc.file_id !== 'number')) throw new Error(`Missing document file in ${context}.`);
      const rowFiles = docs.map((doc) => doc.file_id as number);
      if (new Set(rowFiles).size !== rowFiles.length) throw new Error(`Duplicate document references in ${context}.`);
      if (rowFiles.length) {
        if (files && JSON.stringify(files) !== JSON.stringify(rowFiles)) throw new Error(`Conflicting career documents in ${context}. Resolve references before migration.`);
        files = rowFiles;
      }
      for (const doc of docs) {
        const file = doc.file_id as number;
        const labels = titles.get(file) ?? {};
        labels[row._locale as string] = doc.title as string | null;
        titles.set(file, labels);
      }
    }
    return { parent: first._parent_id as number, branchName: first.branch_name as string, photo: [...photos][0] as number ?? null,
      documents: (files ?? []).map((file) => ({ file, titles: titles.get(file)! })) };
  }).filter((asset) => asset.photo !== null || asset.documents.length > 0);
}

async function writeSharedAssets(db: MigrateUpArgs['db'], assets: SharedAsset[], version: boolean) {
  const table = version ? '_career_v_version_assets' : 'career_assets';
  const documentTable = `${table}_documents`;
  const localeTable = `${documentTable}_locales`;
  let assetIndex = 0;
  let documentIndex = 0;
  for (const asset of assets) {
    assetIndex++;
    const uuid = `shared-${asset.parent}-${asset.branchName}`;
    const id = version ? assetIndex : uuid;
    await db.run(sql`INSERT INTO ${sql.identifier(table)} (_order, _parent_id, id, branch_name, photo_id${version ? sql`, _uuid` : sql``})
      VALUES (${assetIndex}, ${asset.parent}, ${id}, ${asset.branchName}, ${asset.photo}${version ? sql`, ${uuid}` : sql``})`);
    for (const [index, document] of asset.documents.entries()) {
      documentIndex++;
      const documentUUID = `${uuid}-document-${document.file}`;
      const documentID = version ? documentIndex : documentUUID;
      await db.run(sql`INSERT INTO ${sql.identifier(documentTable)} (_order, _parent_id, id, file_id${version ? sql`, _uuid` : sql``})
        VALUES (${index + 1}, ${id}, ${documentID}, ${document.file}${version ? sql`, ${documentUUID}` : sql``})`);
      for (const [locale, title] of Object.entries(document.titles)) {
        await db.run(sql`INSERT INTO ${sql.identifier(localeTable)} (_parent_id, _locale, title) VALUES (${documentID}, ${locale}, ${title})`);
      }
    }
  }
}
