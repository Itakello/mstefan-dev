import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` ADD \`parent_branch_name\` text;`)
  await db.run(sql`ALTER TABLE \`career_locales\` ADD \`lane_spacing\` numeric DEFAULT 24;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` ADD \`parent_branch_name\` text;`)
  await db.run(sql`ALTER TABLE \`_career_v_locales\` ADD \`version_lane_spacing\` numeric DEFAULT 24;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`career_jobs\` DROP COLUMN \`parent_branch_name\`;`)
  await db.run(sql`ALTER TABLE \`career_locales\` DROP COLUMN \`lane_spacing\`;`)
  await db.run(sql`ALTER TABLE \`_career_v_version_jobs\` DROP COLUMN \`parent_branch_name\`;`)
  await db.run(sql`ALTER TABLE \`_career_v_locales\` DROP COLUMN \`version_lane_spacing\`;`)
}
