import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`career_jobs\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`_locale\` text NOT NULL,
  \`id\` text PRIMARY KEY NOT NULL,
  \`branch_name\` text,
  \`company\` text,
  \`role\` text,
  \`summary\` text,
  \`start_date\` text,
  \`end_date\` text,
  \`color\` text DEFAULT '#c77835',
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`career\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`career_jobs_order_idx\` ON \`career_jobs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`career_jobs_parent_id_idx\` ON \`career_jobs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`career_jobs_locale_idx\` ON \`career_jobs\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`career\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`_status\` text DEFAULT 'draft',
  \`updated_at\` text,
  \`created_at\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`career__status_idx\` ON \`career\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`career_locales\` (
  \`mainline_color\` text DEFAULT '#25b8f3',
  \`id\` integer PRIMARY KEY NOT NULL,
  \`_locale\` text NOT NULL,
  \`_parent_id\` integer NOT NULL,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`career\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`career_locales_locale_parent_id_unique\` ON \`career_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_career_v_version_jobs\` (
  \`_order\` integer NOT NULL,
  \`_parent_id\` integer NOT NULL,
  \`_locale\` text NOT NULL,
  \`id\` integer PRIMARY KEY NOT NULL,
  \`branch_name\` text,
  \`company\` text,
  \`role\` text,
  \`summary\` text,
  \`start_date\` text,
  \`end_date\` text,
  \`color\` text DEFAULT '#c77835',
  \`_uuid\` text,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_order_idx\` ON \`_career_v_version_jobs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_parent_id_idx\` ON \`_career_v_version_jobs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_locale_idx\` ON \`_career_v_version_jobs\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`_career_v\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`version__status\` text DEFAULT 'draft',
  \`version_updated_at\` text,
  \`version_created_at\` text,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`snapshot\` integer,
  \`published_locale\` text,
  \`latest\` integer
  );
  `)
  await db.run(sql`CREATE INDEX \`_career_v_version_version__status_idx\` ON \`_career_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_created_at_idx\` ON \`_career_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_updated_at_idx\` ON \`_career_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_snapshot_idx\` ON \`_career_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_published_locale_idx\` ON \`_career_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_latest_idx\` ON \`_career_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_career_v_locales\` (
  \`version_mainline_color\` text DEFAULT '#25b8f3',
  \`id\` integer PRIMARY KEY NOT NULL,
  \`_locale\` text NOT NULL,
  \`_parent_id\` integer NOT NULL,
  FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_career_v_locales_locale_parent_id_unique\` ON \`_career_v_locales\` (\`_locale\`,\`_parent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`career_jobs\`;`)
  await db.run(sql`DROP TABLE \`career_locales\`;`)
  await db.run(sql`DROP TABLE \`career\`;`)
  await db.run(sql`DROP TABLE \`_career_v_version_jobs\`;`)
  await db.run(sql`DROP TABLE \`_career_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_career_v\`;`)
}
