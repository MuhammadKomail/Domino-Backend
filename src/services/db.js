import dotenv from 'dotenv';
import { Pool } from 'pg';

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

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'pgadmin',
  password: process.env.PGPASSWORD || 'pgadmin',
  database: process.env.PGDATABASE || 'jeneergroup',
  ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

export async function tableExists(table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_name = $1 LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

export async function getTableColumns(table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return rows.map(r => r.column_name);
}

export function isSafeIdentifier(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}
