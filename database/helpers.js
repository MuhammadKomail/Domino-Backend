import knex from './index.js';

export async function hasTable(name) {
  return knex.schema.hasTable(name);
}

export async function getColumns(name) {
  const info = await knex(name).columnInfo();
  return Object.keys(info);
}
