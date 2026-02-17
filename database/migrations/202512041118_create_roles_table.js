/**
 * Create roles table with string id, name, description, and allowed_tables (text[])
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('roles');
  if (exists) return;

  await knex.schema.createTable('roles', (t) => {
    t.string('id').primary(); // e.g., 'admin', 'driver', 'customer'
    t.string('name').notNullable().unique();
    t.string('description');
    t.specificType('allowed_tables', 'text[]').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true });
  });
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const exists = await knex.schema.hasTable('roles');
  if (exists) {
    await knex.schema.dropTable('roles');
  }
}
