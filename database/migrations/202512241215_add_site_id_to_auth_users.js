export async function up(knex) {
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  const hasLocations = await knex.schema.hasTable('locations');
  if (!hasAuthUsers || !hasLocations) return;

  const cols = await knex('auth_users').columnInfo();
  if (!cols.site_id) {
    await knex.schema.alterTable('auth_users', (t) => {
      t.integer('site_id').unsigned().nullable();
    });
  }

  try {
    await knex.schema.alterTable('auth_users', (t) => {
      t.foreign('site_id').references('locations.id').onDelete('SET NULL');
    });
  } catch (_) {}
}

export async function down(knex) {
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  if (!hasAuthUsers) return;

  const cols = await knex('auth_users').columnInfo();
  if (!cols.site_id) return;

  try {
    await knex.schema.alterTable('auth_users', (t) => {
      t.dropForeign(['site_id']);
    });
  } catch (_) {}

  await knex.schema.alterTable('auth_users', (t) => {
    t.dropColumn('site_id');
  });
}
