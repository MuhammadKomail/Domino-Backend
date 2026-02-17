// Seed: ensure admin role (full access) and master admin user exist

import crypto from 'crypto';

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
export async function seed(knex) {
  // 1) Ensure admin role exists
  const ROUTE_SCOPES = [
    'dashboard',
    'users:list',
    'users:create',
    'users:edit',
    'reports',
    'roles:manage',
    'companies',
    'locations',
    'devices'
  ];

  const tables = await knex
    .select('tablename')
    .from('pg_catalog.pg_tables')
    .where({ schemaname: 'public' })
    .orderBy('tablename');
  const allowedTables = tables.map((t) => t.tablename);

  await knex('roles')
    .insert({
      id: 'admin',
      name: 'Admin',
      description: 'Admin role',
      allowed_tables: allowedTables,
      allowed_routes: ROUTE_SCOPES,
      created_at: knex.fn.now()
    })
    .onConflict('id')
    .merge({
      name: 'Admin',
      description: 'Admin role',
      allowed_tables: allowedTables,
      allowed_routes: ROUTE_SCOPES,
      updated_at: knex.fn.now()
    });

  // 2) Ensure master admin user exists
  const username = 'admin';
  const email = 'admin@gmail.com';
  const fullName = 'Master Admin';
  const password = 'admin123';

  const cols = await knex('auth_users').columnInfo();

  const baseUser = {
    username,
    email,
    role: 'admin'
  };
  if (cols.full_name) baseUser.full_name = fullName;

  if (cols.password_salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    baseUser.password_salt = salt;
    baseUser.password_hash = hash;
  } else if (cols.salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    baseUser.salt = salt;
    baseUser.password_hash = hash;
  } else if (cols.password) {
    baseUser.password = password;
  } else {
    throw new Error('Auth schema unsupported: missing password columns');
  }

  if (cols.is_active) baseUser.is_active = true;
  if (cols.created_at) baseUser.created_at = knex.fn.now();

  // Upsert by username; also remove any conflicting email user (best-effort)
  try {
    await knex('auth_users').where({ email }).andWhereNot({ username }).del();
  } catch (_) {}

  await knex('auth_users')
    .insert(baseUser)
    .onConflict('username')
    .merge({
      email,
      ...(cols.full_name ? { full_name: fullName } : {}),
      role: 'admin',
      ...(cols.is_active ? { is_active: true } : {}),
      ...(cols.updated_at ? { updated_at: knex.fn.now() } : {})
    });
}
