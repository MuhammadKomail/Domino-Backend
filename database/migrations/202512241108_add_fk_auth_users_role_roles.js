/**
 * Add FK from auth_users.role -> roles.id (string)
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  const hasRoles = await knex.schema.hasTable('roles');
  if (!hasAuthUsers || !hasRoles) return;

  const cols = await knex('auth_users').columnInfo();
  if (!cols.role) return;

  // Avoid failing if the FK already exists
  try {
    const exists = await knex.raw(
      `select 1
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
       where tc.constraint_type = 'FOREIGN KEY'
         and tc.table_name = 'auth_users'
         and kcu.column_name = 'role'
       limit 1`
    );

    const hasFk = Array.isArray(exists?.rows) ? exists.rows.length > 0 : false;
    if (hasFk) return;
  } catch (_) {
    // If introspection fails (non-Postgres), still try to add constraint below.
  }

  try {
    await knex.schema.alterTable('auth_users', (t) => {
      t.foreign('role').references('roles.id').onDelete('SET NULL');
    });
  } catch (_) {
    // Ignore if DB doesn't support it or it already exists.
  }
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  if (!hasAuthUsers) return;

  const cols = await knex('auth_users').columnInfo();
  if (!cols.role) return;

  try {
    await knex.schema.alterTable('auth_users', (t) => {
      t.dropForeign(['role']);
    });
  } catch (_) {
    // best-effort
  }
}
