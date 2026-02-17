import dotenv from 'dotenv';
import knexPkg from 'knex';

dotenv.config();

const knex = knexPkg({
  client: 'pg',
  connection: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'pgadmin',
    password: process.env.PGPASSWORD || 'pgadmin',
    database: process.env.PGDATABASE || 'jeneergroup'
  },
  pool: { min: 0, max: 10 }
});

export default knex;
