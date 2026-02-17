/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const hasDevice = await knex.schema.hasTable('device');
  if (!hasDevice) return;

  const hasWellId = await knex.schema.hasColumn('device', 'well_id');
  if (hasWellId) return;

  await knex.schema.alterTable('device', (t) => {
    t.integer('well_id').notNullable().defaultTo(1);
  });
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const hasDevice = await knex.schema.hasTable('device');
  if (!hasDevice) return;

  const hasWellId = await knex.schema.hasColumn('device', 'well_id');
  if (!hasWellId) return;

  await knex.schema.alterTable('device', (t) => {
    t.dropColumn('well_id');
  });
}
