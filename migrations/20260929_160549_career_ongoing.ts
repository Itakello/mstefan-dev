import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` ADD \`ongoing\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` ADD \`ongoing\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` DROP COLUMN \`ongoing\`;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` DROP COLUMN \`ongoing\`;`)
}
