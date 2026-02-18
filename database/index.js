import dotenv from 'dotenv';
import knexPkg from 'knex';

dotenv.config();

const shouldUseSsl = (() => {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') return true;

  const flag = (process.env.PGSSL || '').toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;

  const host = (process.env.PGHOST || 'localhost').toLowerCase();
  return host !== 'localhost' && host !== '127.0.0.1';
})();

const knex = knexPkg({
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'pgadmin',
    password: process.env.PGPASSWORD || 'pgadmin',
    database: process.env.PGDATABASE || 'jeneergroup',
    ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {})
  },
  pool: { min: 0, max: 10 }
});

export default knex;
