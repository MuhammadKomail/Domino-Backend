import knex from '../../database/index.js';

export { knex };

export async function hasTable(name) {
  return knex.schema.hasTable(name);
}

export async function getColumns(name) {
  const info = await knex(name).columnInfo();
  return Object.keys(info);
}
