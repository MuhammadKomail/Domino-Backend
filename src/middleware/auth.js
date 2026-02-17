import { getSession, isAuthenticated } from '../services/session.js';
import { jsonResponse } from '../utils/response.js';

export function getSessionId(req) {
  return req.header('Session-ID') || '';
}

export function requireAuth(req, res, next) {
  const sid = getSessionId(req);
  if (!sid || !isAuthenticated(sid)) {
    return jsonResponse(res, { error: 'Authentication required' }, 401);
  }
  req.session = getSession(sid);
  return next();
}
