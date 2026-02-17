import { verifyToken } from '../services/jwt.js';
import { getSession } from '../services/session.js';
import { jsonResponse } from '../utils/response.js';
import { isRevoked } from '../services/jwt.js';

export function getBearer(req) {
  const h = req.header('Authorization') || '';
  const parts = h.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  return '';
}

export function getSessionId(req) {
  return req.header('Session-ID') || '';
}

function unauthorized(res, params = {}) {
  const { error = 'invalid_token', description = 'Authentication required' } = params;
  res.set('WWW-Authenticate', `Bearer realm="access", error="${error}", error_description="${description}"`);
  return jsonResponse(res, { error: 'unauthorized', reason: error, message: description }, 401);
}

export function requireAuth(req, res, next) {
  const token = getBearer(req);
  if (token) {
    if (isRevoked(token)) {
      return unauthorized(res, { error: 'invalid_token', description: 'Token has been revoked. Please login again.' });
    }
    const payload = verifyToken(token);
    if (payload) {
      req.user = { username: payload.username, role: payload.role };
      return next();
    }
    // If a bearer token was provided but invalid, deny explicitly
    return unauthorized(res, { error: 'invalid_token', description: 'Invalid or expired token.' });
  }
  const sid = getSessionId(req);
  if (sid) {
    const sess = getSession(sid);
    if (sess) {
      req.user = { username: sess.username, role: sess.role };
      return next();
    }
    return unauthorized(res, { error: 'invalid_request', description: 'Invalid Session-ID.' });
  }
  return unauthorized(res, { error: 'invalid_request', description: 'Missing Authorization Bearer or Session-ID.' });
}
