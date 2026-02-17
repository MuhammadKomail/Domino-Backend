/**
 * Add well_id and geolocation columns to locations table (idempotent)
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const has = await knex.schema.hasTable('locations');
  if (!has) return;
  const cols = await knex('locations').columnInfo();
  await knex.schema.alterTable('locations', (t) => {
    if (!cols.well_id) {
      t.string('well_id');
    }
    if (!cols.geolocation) {
      t.string('geolocation');
    }
  });
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const has = await knex.schema.hasTable('locations');
  if (!has) return;
  const cols = await knex('locations').columnInfo();
  await knex.schema.alterTable('locations', (t) => {
    if (cols.geolocation) {
      t.dropColumn('geolocation');
    }
    if (cols.well_id) {
      t.dropColumn('well_id');
    }
  });
}
