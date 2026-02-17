import { v4 as uuidv4 } from 'uuid';

const sessions = new Map(); // sessionId -> { username, role }

export function createSession(username, role = 'user') {
  const sessionId = uuidv4();
  sessions.set(sessionId, { username, role, token: null });
  return sessionId;
}

export function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function isAuthenticated(sessionId) {
  return sessions.has(sessionId);
}

export function setSessionToken(sessionId, token) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  s.token = token;
  sessions.set(sessionId, s);
  return true;
}

export function getSessionToken(sessionId) {
  const s = sessions.get(sessionId);
  return s?.token || null;
}
