// Knex configuration
require('dotenv').config();

const base = {
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'pgadmin',
    password: process.env.PGPASSWORD || 'pgadmin',
    database: process.env.PGDATABASE || 'jeneergroup'
  },
  migrations: {
    directory: './database/migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './database/seeds'
  }
};

module.exports = {
  development: base,
  production: base,
  test: base
};
