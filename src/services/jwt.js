import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// In-memory blacklist for revoked tokens (value is expiration timestamp in ms)
const revoked = new Map();

function nowMs() {
  return Date.now();
}

export function revokeToken(token) {
  try {
    const decoded = jwt.decode(token);
    const expSec = decoded?.exp;
    if (expSec) {
      revoked.set(token, expSec * 1000);
    } else {
      // If no exp, revoke for a default window (2h)
      const ttlMs = 2 * 60 * 60 * 1000;
      revoked.set(token, nowMs() + ttlMs);
    }
  } catch {
    // If can't decode, still blacklist briefly
    revoked.set(token, nowMs() + 30 * 60 * 1000);
  }
}

export function isRevoked(token) {
  const exp = revoked.get(token);
  if (!exp) return false;
  if (exp < nowMs()) {
    revoked.delete(token);
    return false;
  }
  return true;
}
