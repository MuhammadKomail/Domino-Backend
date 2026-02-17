import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';

export async function loadRoleScopes(username) {
  const user = await knex('auth_users').select(['role']).where({ username }).first();
  const roleId = user?.role || 'guest';
  const role = await knex('roles').select(['allowed_tables', 'allowed_routes']).where({ id: roleId }).first();
  return {
    role: roleId,
    allowedTables: role?.allowed_tables || [],
    allowedRoutes: role?.allowed_routes || []
  };
}

export function allowTable() {
  return async function (req, res, next) {
    try {
      const username = req.user?.username;
      if (!username) return jsonResponse(res, { error: 'unauthorized', message: 'Missing user context' }, 401);
      const { role, allowedTables } = await loadRoleScopes(username);
      if (role === 'admin') return next();
      const table = req.params.name;
      if (allowedTables.includes(table)) return next();
      return jsonResponse(res, { error: 'forbidden', message: 'Access to table is not permitted for your role' }, 403);
    } catch (e) {
      return jsonResponse(res, { error: 'forbidden', message: 'RBAC check failed' }, 403);
    }
  };
}

export function allowRoute(scope) {
  return async function (req, res, next) {
    try {
      const username = req.user?.username;
      if (!username) return jsonResponse(res, { error: 'unauthorized', message: 'Missing user context' }, 401);
      const { role, allowedRoutes } = await loadRoleScopes(username);
      if (role === 'admin') return next();
      if (allowedRoutes.includes(scope)) return next();
      return jsonResponse(res, { error: 'forbidden', message: 'Access to route is not permitted for your role' }, 403);
    } catch (e) {
      return jsonResponse(res, { error: 'forbidden', message: 'RBAC check failed' }, 403);
    }
  };
}
