import dotenv from 'dotenv';
import app from './src/app.js';
import knex from './database/index.js';

dotenv.config();

const PORT = process.env.PORT || 300;

async function start() {
  try {
    await knex.raw('select 1');
    // eslint-disable-next-line no-console
    console.log('Database connection: OK');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Database connection failed:', e.message || e);
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend-Node listening on http://localhost:${PORT}`);
  });
}

start();
