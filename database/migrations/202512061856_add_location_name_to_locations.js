/**
 * Add a human-friendly name column `location` to locations table
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const has = await knex.schema.hasTable('locations');
  if (!has) return;
  const cols = await knex('locations').columnInfo();
  if (!cols.location) {
    await knex.schema.alterTable('locations', (t) => {
      t.string('location');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const has = await knex.schema.hasTable('locations');
  if (!has) return;
  const cols = await knex('locations').columnInfo();
  if (cols.location) {
    await knex.schema.alterTable('locations', (t) => {
      t.dropColumn('location');
    });
  }
}
