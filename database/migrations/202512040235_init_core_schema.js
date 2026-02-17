/**
 * Core schema based on provided diagram
 * Tables: company, locations, device, pump_settings, pump_data, auth_users, user_sessions
 */

/**
 * @param { import('knex').Knex } knex
 */
export async function up(knex) {
  // company
  const hasCompany = await knex.schema.hasTable('company');
  if (!hasCompany) {
    await knex.schema.createTable('company', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('address');
      t.string('city');
      t.string('state');
      t.string('zip');
      t.boolean('deleted').defaultTo(false);
    });
  }

  // locations
  const hasLocations = await knex.schema.hasTable('locations');
  if (!hasLocations) {
    await knex.schema.createTable('locations', (t) => {
      t.increments('id').primary();
      t.integer('comp_id').unsigned().references('id').inTable('company').onDelete('SET NULL');
      t.string('address');
      t.string('city');
      t.string('state');
      t.string('zip');
      t.boolean('deleted').defaultTo(false);
    });
  }

  // device
  const hasDevice = await knex.schema.hasTable('device');
  if (!hasDevice) {
    await knex.schema.createTable('device', (t) => {
      t.increments('id').primary();
      t.string('product');
      t.string('device_serial');
      t.timestamp('mfg_date', { useTz: true });
      t.string('board');
      t.string('description');
      t.string('sw_rev');
      t.integer('location_id').unsigned().references('id').inTable('locations').onDelete('SET NULL');
      t.integer('company_id').unsigned().references('id').inTable('company').onDelete('SET NULL');
    });
  }

  // pump_settings
  const hasPumpSettings = await knex.schema.hasTable('pump_settings');
  if (!hasPumpSettings) {
    await knex.schema.createTable('pump_settings', (t) => {
      t.increments('id').primary();
      t.integer('device_id').unsigned().references('id').inTable('device').onDelete('CASCADE');
      t.integer('hold');
      t.integer('min_air');
      t.integer('max_air');
      t.integer('purge');
      t.integer('max_idle');
      t.integer('rest');
      t.integer('thres');
      t.integer('vol_per_cycle');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('update', { useTz: true });
    });
  }

  // pump_data
  const hasPumpData = await knex.schema.hasTable('pump_data');
  if (!hasPumpData) {
    await knex.schema.createTable('pump_data', (t) => {
      t.increments('id').primary();
      t.integer('device_id').unsigned().references('id').inTable('device').onDelete('CASCADE');
      t.integer('cycle_count');
      t.integer('bad_cycles');
      t.integer('volume_pumped');
      t.decimal('batt_voltage', 10, 3);
      t.integer('cur_adc');
      t.integer('high_adc');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // auth_users
  const hasAuthUsers = await knex.schema.hasTable('auth_users');
  if (!hasAuthUsers) {
    await knex.schema.createTable('auth_users', (t) => {
      t.increments('id').primary();
      t.string('username').notNullable().unique();
      t.string('email').notNullable().unique();
      t.string('password_hash').notNullable();
      t.string('salt').notNullable();
      t.string('full_name');
      t.string('role');
      t.boolean('is_active').defaultTo(true);
      t.timestamp('last_login', { useTz: true });
      t.integer('failed_login_attempts').defaultTo(0);
      t.timestamp('locked_until', { useTz: true });
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // user_sessions
  const hasUserSessions = await knex.schema.hasTable('user_sessions');
  if (!hasUserSessions) {
    await knex.schema.createTable('user_sessions', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().references('id').inTable('auth_users').onDelete('CASCADE');
      t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      t.timestamp('expires_at', { useTz: true });
      t.string('ip_address');
      t.string('user_agent');
      t.boolean('is_active').defaultTo(true);
      t.timestamp('updated_at', { useTz: true });
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
  // Drop in reverse dependency order
  const dropIf = async (name) => {
    const exists = await knex.schema.hasTable(name);
    if (exists) await knex.schema.dropTable(name);
  };
  await dropIf('user_sessions');
  await dropIf('auth_users');
  await dropIf('pump_data');
  await dropIf('pump_settings');
  await dropIf('device');
  await dropIf('locations');
  await dropIf('company');
}
