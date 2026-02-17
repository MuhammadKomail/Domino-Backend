/**
 * Add allowed_routes (text[]) to roles for page-level scopes
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const has = await knex.schema.hasTable('roles');
  if (!has) return;
  const cols = await knex('roles').columnInfo();
  if (!cols.allowed_routes) {
    await knex.schema.alterTable('roles', (t) => {
      t.specificType('allowed_routes', 'text[]').notNullable().defaultTo('{}');
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const has = await knex.schema.hasTable('roles');
  if (!has) return;
  const cols = await knex('roles').columnInfo();
  if (cols.allowed_routes) {
    await knex.schema.alterTable('roles', (t) => {
      t.dropColumn('allowed_routes');
    });
  }
}
