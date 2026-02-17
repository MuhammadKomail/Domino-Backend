export async function up(knex) {
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  if (!hasAuthUsers) return;

  const hasTable = await knex.schema.hasTable('email_otps');
  if (hasTable) return;

  await knex.schema.createTable('email_otps', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().nullable().references('id').inTable('auth_users').onDelete('SET NULL');
    t.string('email').notNullable();
    t.string('otp_hash').notNullable();
    t.string('otp_salt').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('used_at', { useTz: true }).nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('email_otps', (t) => {
    t.index(['email', 'created_at']);
    t.index(['email', 'expires_at']);
  });
}

export async function down(knex) {
  const hasTable = await knex.schema.hasTable('email_otps');
  if (!hasTable) return;
  await knex.schema.dropTable('email_otps');
}
