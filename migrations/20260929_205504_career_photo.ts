import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`alt\` text;`)
  await db.run(sql`ALTER TABLE \`career_jobs\` ADD \`photo_id\` integer REFERENCES media(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`career_jobs_photo_idx\` ON \`career_jobs\` (\`photo_id\`);`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` ADD \`photo_id\` integer REFERENCES media(id) ON DELETE SET NULL;`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_photo_idx\` ON \`_career_v_version_jobs\` (\`photo_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_career_jobs\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`_locale\` text NOT NULL,
	\`id\` text PRIMARY KEY NOT NULL,
	\`branch_name\` text,
	\`parent_branch_name\` text,
	\`company\` text,
	\`role\` text,
	\`summary\` text,
	\`start_date\` text,
	\`ongoing\` integer DEFAULT false,
	\`end_date\` text,
	\`color\` text DEFAULT '#c77835',
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`career\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_career_jobs\`("_order", "_parent_id", "_locale", "id", "branch_name", "parent_branch_name", "company", "role", "summary", "start_date", "ongoing", "end_date", "color") SELECT "_order", "_parent_id", "_locale", "id", "branch_name", "parent_branch_name", "company", "role", "summary", "start_date", "ongoing", "end_date", "color" FROM \`career_jobs\`;`)
  await db.run(sql`DROP TABLE \`career_jobs\`;`)
  await db.run(sql`ALTER TABLE \`__new_career_jobs\` RENAME TO \`career_jobs\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`career_jobs_order_idx\` ON \`career_jobs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`career_jobs_parent_id_idx\` ON \`career_jobs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`career_jobs_locale_idx\` ON \`career_jobs\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`__new__career_v_version_jobs\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`_locale\` text NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`branch_name\` text,
	\`parent_branch_name\` text,
	\`company\` text,
	\`role\` text,
	\`summary\` text,
	\`start_date\` text,
	\`ongoing\` integer DEFAULT false,
	\`end_date\` text,
	\`color\` text DEFAULT '#c77835',
	\`_uuid\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_career_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new__career_v_version_jobs\`("_order", "_parent_id", "_locale", "id", "branch_name", "parent_branch_name", "company", "role", "summary", "start_date", "ongoing", "end_date", "color", "_uuid") SELECT "_order", "_parent_id", "_locale", "id", "branch_name", "parent_branch_name", "company", "role", "summary", "start_date", "ongoing", "end_date", "color", "_uuid" FROM \`_career_v_version_jobs\`;`)
  await db.run(sql`DROP TABLE \`_career_v_version_jobs\`;`)
  await db.run(sql`ALTER TABLE \`__new__career_v_version_jobs\` RENAME TO \`_career_v_version_jobs\`;`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_order_idx\` ON \`_career_v_version_jobs\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_parent_id_idx\` ON \`_career_v_version_jobs\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_career_v_version_jobs_locale_idx\` ON \`_career_v_version_jobs\` (\`_locale\`);`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`alt\`;`)
}
