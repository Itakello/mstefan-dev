import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` ADD \`position_title\` text;`)
  await db.run(sql`ALTER TABLE \`career_jobs\` ADD \`place\` text;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` ADD \`position_title\` text;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` ADD \`place\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` DROP COLUMN \`position_title\`;`)
  await db.run(sql`ALTER TABLE \`career_jobs\` DROP COLUMN \`place\`;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` DROP COLUMN \`position_title\`;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` DROP COLUMN \`place\`;`)
}
