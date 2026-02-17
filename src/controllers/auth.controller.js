import { jsonResponse } from '../utils/response.js';
import { createSession, deleteSession, getSession, setSessionToken, getSessionToken } from '../services/session.js';
import { signToken, verifyToken } from '../services/jwt.js';
import { revokeToken } from '../services/jwt.js';
import crypto from 'crypto';
import knex from '../../database/index.js';
import { loadRoleScopes } from '../middleware/rbac.js';
import { normalizeEmail, sendEmail, generateNumericOtp, hashOtp } from '../services/email.js';

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return jsonResponse(res, { success: false, message: 'Username and password required' }, 400);
  }

  // Look up user and verify password
  let dbUser;
  try {
    const cols = await knex('auth_users').columnInfo();
    const selectFields = ['id', 'role'];
    if (cols.password_salt) selectFields.push('password_salt');
    if (cols.salt) selectFields.push('salt');
    if (cols.password_hash) selectFields.push('password_hash');
    if (cols.password) selectFields.push('password');
    if (cols.failed_login_attempts) selectFields.push('failed_login_attempts');
    if (cols.locked_until) selectFields.push('locked_until');
    dbUser = await knex('auth_users').select(selectFields).where({ username }).first();
  } catch (e) {
    console.log('e: ', e);

    return jsonResponse(res, { success: false, message: 'No user exists with these credentials' }, 401);
  }
  if (!dbUser) {
    console.log('dbUser: ', dbUser);

    return jsonResponse(res, { success: false, message: 'No user exists with these credentials' }, 401);
  }
  // If locked_until is set in the future, block login
  try {
    const cols = await knex('auth_users').columnInfo();
    if (cols.locked_until && dbUser.locked_until) {
      const lockedUntil = new Date(dbUser.locked_until);
      if (!isNaN(lockedUntil.getTime()) && lockedUntil > new Date()) {
        const msLeft = lockedUntil.getTime() - Date.now();
        const minutesLeft = Math.ceil(msLeft / 60000);
        const msg = minutesLeft <= 1
          ? 'Your account is locked. Please wait 1 minute to try again.'
          : `Your account is locked. Please wait ${minutesLeft} minutes to try again.`;
        return jsonResponse(res, { success: false, message: msg }, 423);
      }
    }
  } catch (_) {}
  try {
    // Verify with available fields
    if (Object.prototype.hasOwnProperty.call(dbUser, 'password_hash') && (Object.prototype.hasOwnProperty.call(dbUser, 'password_salt') || Object.prototype.hasOwnProperty.call(dbUser, 'salt'))) {
      const saltVal = dbUser.password_salt || dbUser.salt;
      if (!saltVal || !dbUser.password_hash) {
        return jsonResponse(res, { success: false, message: 'Invalid credentials' }, 401);
      }
      // Try sha512 first (current), then sha256 (legacy)
      const derived512 = crypto.pbkdf2Sync(password, saltVal, 100000, 64, 'sha512').toString('hex');
      if (derived512 !== dbUser.password_hash) {
        const derived256 = crypto.pbkdf2Sync(password, saltVal, 100000, 64, 'sha256').toString('hex');
        if (derived256 !== dbUser.password_hash) {
          // Wrong password: increment attempts and maybe lock
          try {
            const cols = await knex('auth_users').columnInfo();
            if (cols.failed_login_attempts) {
              const current = Number(dbUser.failed_login_attempts || 0) + 1;
              const updates = { failed_login_attempts: current };
              if (current >= 5 && cols.locked_until) {
                const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 1);
                const until = new Date(Date.now() + lockMinutes * 60 * 1000);
                updates.locked_until = until;
              }
              await knex('auth_users').where({ id: dbUser.id }).update(updates);
            }
          } catch (_) {}
          return jsonResponse(res, { success: false, message: 'Invalid credentials' }, 401);
        }
      }
    } else if (Object.prototype.hasOwnProperty.call(dbUser, 'password')) {
      // Legacy plaintext fallback
      if (password !== dbUser.password) {
        // Wrong password: increment attempts and maybe lock
        try {
          const cols = await knex('auth_users').columnInfo();
          if (cols.failed_login_attempts) {
            const current = Number(dbUser.failed_login_attempts || 0) + 1;
            const updates = { failed_login_attempts: current };
            if (current >= 5 && cols.locked_until) {
              const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 1);
              const until = new Date(Date.now() + lockMinutes * 60 * 1000);
              updates.locked_until = until;
            }
            await knex('auth_users').where({ id: dbUser.id }).update(updates);
          }
        } catch (_) {}
        return jsonResponse(res, { success: false, message: 'Invalid credentials' }, 401);
      }
    } else if (Object.prototype.hasOwnProperty.call(dbUser, 'password_hash')) {
      // Hash without salt present: cannot verify reliably
      return jsonResponse(res, { success: false, message: 'Invalid credentials' }, 401);
    } else {
      return jsonResponse(res, { success: false, message: 'Invalid credentials' }, 401);
    }
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Authentication failed' }, 401);
  }

  // Determine role from DB, fallback to guest
  const role = dbUser.role || 'guest';

  const sessionId = createSession(username, role);
  const token = signToken({ username, role });
  setSessionToken(sessionId, token);

  // Write to user_sessions per your schema
  try {
    // Use fetched user id
    const user = { id: dbUser.id };
    if (user.id) {
      // Update last_login (if the column exists, this will succeed; otherwise DB will error and be caught)
      try {
        const cols = await knex('auth_users').columnInfo();
        const updates = { last_login: knex.fn.now() };
        if (cols.failed_login_attempts) updates.failed_login_attempts = 0;
        if (cols.locked_until) updates.locked_until = null;
        await knex('auth_users').where({ id: user.id }).update(updates);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('auth_users.last_login update skipped:', e.message || e);
      }

      const ua = req.get('user-agent') || '';
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString();
      try {
        await knex('user_sessions').insert({
          user_id: user.id,
          user_agent: ua,
          ip_address: ip,
          is_active: true,
          created_at: knex.fn.now(),
          expires_at: knex.fn.now()
        });
      } catch (err) {
        const msg = (err && (err.message || String(err))) || '';
        if (msg.includes('null value in column "id"') || msg.includes('violates not-null constraint')) {
          // No default on id; compute next id and retry (best-effort). Consider adding a sequence/default in DB later.
          const row = await knex('user_sessions').max({ max: 'id' }).first();
          const nextId = (row?.max || 0) + 1;
          await knex('user_sessions').insert({
            id: nextId,
            user_id: user.id,
            user_agent: ua,
            ip_address: ip,
            is_active: true,
            created_at: knex.fn.now(),
            expires_at: knex.fn.now()
          });
        } else {
          throw err;
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('user_sessions insert failed:', e.message || e);
  }
  // Load role scopes to return with login
  let scopes = { role, allowedTables: [], allowedRoutes: [] };
  try {
    scopes = await loadRoleScopes(username);
  } catch (_) { }
  // Build trimmed user object
  let userPicked = { id: null, username, email: null, full_name: null, role: scopes.role };
  try {
    const userRow = await knex('auth_users')
      .select('id', 'username', 'email', 'full_name', 'role')
      .where({ username })
      .first();
    if (userRow) {
      userPicked = {
        id: userRow.id ?? null,
        username: userRow.username || username,
        email: userRow.email ?? null,
        full_name: userRow.full_name ?? null,
        role: userRow.role ?? scopes.role
      };
    }
  } catch (_) { }

  return jsonResponse(res, {
    success: true,
    sessionId,
    token,
    message: 'Login successful',
    role: scopes.role,
    user: userPicked,
    allowed_tables: scopes.allowedTables,
    allowed_routes: scopes.allowedRoutes
  });
}

export async function me(req, res) {
  const username = req.user?.username;
  if (!username) return jsonResponse(res, { error: 'unauthorized' }, 401);
  try {
    const scopes = await loadRoleScopes(username);
    // Restrict to specific fields for /me response
    const userRow = await knex('auth_users')
      .select('id', 'username', 'email', 'full_name', 'role')
      .where({ username })
      .first();
    const user = userRow || { id: null, username, email: null, full_name: null, role: 'guest' };
    const picked = {
      id: user.id ?? null,
      username: user.username || username,
      email: user.email ?? null,
      full_name: user.full_name ?? null,
      role: user.role ?? 'guest'
    };
    return jsonResponse(res, {
      user: picked,
      allowed_tables: scopes.allowedTables,
      allowed_routes: scopes.allowedRoutes
    });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to load profile' }, 500);
  }
}

function verifyDbPassword(dbUser, password) {
  if (!dbUser || !password) return false;

  if (Object.prototype.hasOwnProperty.call(dbUser, 'password_hash') && (Object.prototype.hasOwnProperty.call(dbUser, 'password_salt') || Object.prototype.hasOwnProperty.call(dbUser, 'salt'))) {
    const saltVal = dbUser.password_salt || dbUser.salt;
    if (!saltVal || !dbUser.password_hash) return false;
    const derived512 = crypto.pbkdf2Sync(password, saltVal, 100000, 64, 'sha512').toString('hex');
    if (derived512 === dbUser.password_hash) return true;
    const derived256 = crypto.pbkdf2Sync(password, saltVal, 100000, 64, 'sha256').toString('hex');
    return derived256 === dbUser.password_hash;
  }

  if (Object.prototype.hasOwnProperty.call(dbUser, 'password')) {
    return password === dbUser.password;
  }

  return false;
}

function setDbPassword(updates, cols, newPassword) {
  if (cols.password_salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(newPassword, salt, 100000, 64, 'sha512').toString('hex');
    updates.password_salt = salt;
    updates.password_hash = hash;
    if (cols.password) updates.password = null;
    return { ok: true };
  }

  if (cols.salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(newPassword, salt, 100000, 64, 'sha512').toString('hex');
    updates.salt = salt;
    updates.password_hash = hash;
    if (cols.password) updates.password = null;
    return { ok: true };
  }

  if (cols.password) {
    updates.password = newPassword;
    return { ok: true };
  }

  return { ok: false, error: 'Auth schema unsupported: missing password columns' };
}

export async function adminResetPassword(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') return jsonResponse(res, { error: 'forbidden' }, 403);

  const email = normalizeEmail(req.body?.email);
  const newPassword = req.body?.newPassword;
  if (!email || !newPassword) {
    return jsonResponse(res, { success: false, message: 'Email and newPassword are required' }, 400);
  }

  try {
    const cols = await knex('auth_users').columnInfo();
    const user = await knex('auth_users')
      .select(['id', 'email'])
      .whereRaw('lower(email) = lower(?)', [email])
      .first();

    if (!user?.id) return jsonResponse(res, { success: false, message: 'User not found' }, 404);

    const updates = {};
    const passRes = setDbPassword(updates, cols, String(newPassword));
    if (!passRes.ok) return jsonResponse(res, { success: false, message: passRes.error }, 500);

    if (cols.updated_at) updates.updated_at = knex.fn.now();
    if (cols.failed_login_attempts) updates.failed_login_attempts = 0;
    if (cols.locked_until) updates.locked_until = null;

    await knex('auth_users').where({ id: user.id }).update(updates);

    return jsonResponse(res, { success: true, message: 'Password reset successfully' });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Failed to reset password' }, 500);
  }
}

export async function resetPasswordDirect(req, res) {
  const secret = String(process.env.ADMIN_RESET_KEY || '');
  const headerKey = String(req.header('X-Admin-Reset-Key') || '');
  if (!secret || headerKey !== secret) {
    return jsonResponse(res, { error: 'forbidden' }, 403);
  }

  const email = normalizeEmail(req.body?.email);
  const newPassword = req.body?.newPassword;
  if (!email || !newPassword) {
    return jsonResponse(res, { success: false, message: 'Email and newPassword are required' }, 400);
  }

  try {
    const cols = await knex('auth_users').columnInfo();
    const user = await knex('auth_users')
      .select(['id', 'email'])
      .whereRaw('lower(email) = lower(?)', [email])
      .first();

    if (!user?.id) return jsonResponse(res, { success: false, message: 'User not found' }, 404);

    const updates = {};
    const passRes = setDbPassword(updates, cols, String(newPassword));
    if (!passRes.ok) return jsonResponse(res, { success: false, message: passRes.error }, 500);

    if (cols.updated_at) updates.updated_at = knex.fn.now();
    if (cols.failed_login_attempts) updates.failed_login_attempts = 0;
    if (cols.locked_until) updates.locked_until = null;

    await knex('auth_users').where({ id: user.id }).update(updates);
    return jsonResponse(res, { success: true, message: 'Password reset successfully' });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Failed to reset password' }, 500);
  }
}

export async function changePassword(req, res) {
  const username = req.user?.username;
  if (!username) return jsonResponse(res, { error: 'unauthorized' }, 401);

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return jsonResponse(res, { success: false, message: 'Current password and new password are required' }, 400);
  }

  try {
    const cols = await knex('auth_users').columnInfo();
    const selectFields = ['id', 'username'];
    if (cols.password_salt) selectFields.push('password_salt');
    if (cols.salt) selectFields.push('salt');
    if (cols.password_hash) selectFields.push('password_hash');
    if (cols.password) selectFields.push('password');

    const dbUser = await knex('auth_users').select(selectFields).where({ username }).first();
    if (!dbUser) return jsonResponse(res, { success: false, message: 'User not found' }, 404);

    const ok = verifyDbPassword(dbUser, currentPassword);
    if (!ok) return jsonResponse(res, { success: false, message: 'Current password is incorrect' }, 401);

    const updates = {};
    const passRes = setDbPassword(updates, cols, newPassword);
    if (!passRes.ok) return jsonResponse(res, { success: false, message: passRes.error }, 500);
    if (cols.updated_at) updates.updated_at = knex.fn.now();

    await knex('auth_users').where({ id: dbUser.id }).update(updates);

    return jsonResponse(res, { success: true, message: 'Password changed successfully' });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Failed to change password' }, 500);
  }
}

export async function logout(req, res) {
  const { sessionId } = req.body || {};
  // Revoke bearer token if provided
  const auth = req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.*)$/i);
  if (m) {
    revokeToken(m[1]);
  }
  // If no Authorization header, try revoking the token stored for this session
  if (!m && sessionId) {
    const saved = getSessionToken(sessionId);
    if (saved) revokeToken(saved);
  }
  if (!sessionId) return jsonResponse(res, { success: false, message: 'Session ID required' }, 400);
  // Close user_sessions row(s) for this user (is_active -> false, expires_at -> now)
  try {
    const usernameFromSession = (getSession(sessionId)?.username) || null;
    const user = await knex('auth_users').select('id').where({ username: usernameFromSession }).first();
    if (user?.id) {
      await knex('user_sessions')
        .where({ user_id: user.id, is_active: true })
        .update({ is_active: false, expires_at: knex.fn.now(), updated_at: knex.fn.now() });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('user_sessions close failed:', e.message || e);
  }
  const success = deleteSession(sessionId);
  return jsonResponse(res, { success, message: success ? 'Logout successful' : 'Logout failed' }, success ? 200 : 500);
}

export async function register(req, res) {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : body.username;
  const email = typeof body.email === 'string' ? body.email.trim() : body.email;
  const password = body.password;
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : body.fullName;
  const roleInput = (body.role ?? body.roleId ?? body.role_id);
  const siteId = body.site_id ?? body.siteId;
  if (!username || !email || !password) {
    return jsonResponse(res, { success: false, message: 'Username, email, and password are required' }, 400);
  }
  try {
    // Check if user exists
    const existing = await knex('auth_users')
      .where('username', username)
      .orWhere('email', email)
      .first();
    if (existing) {
      return jsonResponse(res, { success: false, message: 'Username or email already exists' }, 409);
    }

    // Resolve role (accept role id like 'admin' or role name like 'Admin')
    const defaultRoleId = (process.env.DEFAULT_ROLE_ID || 'guest').toString();
    let resolvedRoleId = roleInput != null && `${roleInput}`.trim() ? `${roleInput}`.trim() : defaultRoleId;
    if (resolvedRoleId !== defaultRoleId) {
      const roleById = await knex('roles').select(['id']).where({ id: resolvedRoleId }).first();
      if (!roleById) {
        const roleByName = await knex('roles')
          .select(['id'])
          .whereRaw('lower(name) = lower(?)', [resolvedRoleId])
          .first();
        if (!roleByName) {
          return jsonResponse(res, { success: false, message: 'Role not found' }, 404);
        }
        resolvedRoleId = roleByName.id;
      }
    } else {
      // Ensure default role exists if roles table is used
      try {
        const roleById = await knex('roles').select(['id']).where({ id: resolvedRoleId }).first();
        if (!roleById) {
          resolvedRoleId = 'guest';
        }
      } catch (_) {}
    }

    // Prepare insert respecting current schema
    const cols = await knex('auth_users').columnInfo();
    const toInsert = { username, email };
    if (cols.full_name) toInsert.full_name = fullName || null;
    if (cols.role) toInsert.role = resolvedRoleId;
    if (cols.site_id && siteId !== undefined) {
      if (siteId == null) {
        toInsert.site_id = null;
      } else {
        const site = await knex('locations').select('id').where({ id: siteId }).first();
        if (!site) {
          return jsonResponse(res, { success: false, message: 'Site not found' }, 404);
        }
        toInsert.site_id = siteId;
      }
    }

    // Prefer salted hash if supported, else plaintext fallback
    if (cols.password_salt && cols.password_hash) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      toInsert.password_salt = salt;
      toInsert.password_hash = hash;
    } else if (cols.salt && cols.password_hash) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      toInsert.salt = salt;
      toInsert.password_hash = hash;
    } else if (cols.password) {
      toInsert.password = password; // legacy plaintext
    } else {
      return jsonResponse(res, { success: false, message: 'Auth schema unsupported: missing password columns' }, 500);
    }

    let created = null;
    try {
      // Postgres supports RETURNING
      const rows = await knex('auth_users').insert(toInsert).returning(['id', 'username', 'email']);
      created = rows?.[0] || null;
    } catch (_) {
      // Fallback if returning not supported
      await knex('auth_users').insert(toInsert);
    }
    return jsonResponse(res, { success: true, message: 'Account created successfully', user: created || { username, email } });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Registration error' }, 500);
  }
}

export async function validate(req, res) {
  // Prefer Authorization Bearer token if provided
  const auth = req.header('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.*)$/i);
  if (match) {
    const payload = verifyToken(match[1]);
    if (payload) return jsonResponse(res, { valid: true, user: { username: payload.username, role: payload.role } });
  }

  const { sessionId } = req.body || {};
  if (sessionId) {
    const sess = getSession(sessionId);
    if (sess) return jsonResponse(res, { valid: true, user: { username: sess.username, role: sess.role } });
  }
  return jsonResponse(res, { valid: false });
}

export async function requestOtp(req, res) {
  const emailRaw = req.body?.email;
  const email = normalizeEmail(emailRaw);
  try {
    const user = await knex('auth_users').select('id', 'email').whereRaw('lower(email) = lower(?)', [email]).first();
    if (!user) {
      return jsonResponse(res, { success: false, message: 'Email not found' }, 404);
    }

    const otp = generateNumericOtp(6);
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashOtp(otp, salt);
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await knex('email_otps').insert({
      user_id: user.id,
      email,
      otp_hash: otpHash,
      otp_salt: salt,
      expires_at: expiresAt,
      used_at: null,
      attempts: 0,
      created_at: knex.fn.now()
    });

    const brand = process.env.EMAIL_BRAND || process.env.APP_NAME || 'Jeneer';
    const product = process.env.EMAIL_PRODUCT || process.env.APP_NAME || 'DERPS';
    const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '';
    const subject = `${brand} | Your verification code for ${product}: ${otp}`;
    const text = [
      `${brand} — Verification Code`,
      '',
      `We received a request to sign in to ${product} using this email address (${email}).`,
      '',
      'Your one-time verification code (OTP) is:',
      '',
      `  ${otp}`,
      '',
      `This code expires in ${ttlMinutes} minutes.`,
      '',
      'How to use it:',
      '1) Go back to the verification screen',
      '2) Enter the code exactly as shown above',
      '3) Continue to complete sign-in',
      '',
      'Security notice:',
      '- Do not share this code with anyone (including support).',
      '- If you did not request this code, ignore this email. Your account will remain secure.',
      ...(supportEmail ? ['', `Need help? Contact: ${supportEmail}`] : []),
      '',
      `Regards,`,
      `${brand} Team`
    ].join('\n');
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${brand} Verification Code</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:#0f172a;color:#ffffff;">
                <div style="font-size:16px;font-weight:700;line-height:20px;">${brand}</div>
                <div style="font-size:13px;opacity:0.9;margin-top:4px;">Verification Code for ${product}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="font-size:18px;font-weight:700;margin:0 0 8px 0;">Your verification code</div>
                <div style="font-size:14px;line-height:20px;color:#374151;">We received a request to sign in to <strong>${product}</strong> using <strong>${email}</strong>.</div>
                <div style="margin:18px 0 16px 0;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;text-align:center;">
                  <div style="font-size:12px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;">One-time code</div>
                  <div style="font-size:32px;font-weight:800;letter-spacing:0.25em;margin-top:6px;color:#0f172a;">${otp}</div>
                </div>
                <div style="font-size:14px;line-height:20px;color:#374151;">This code expires in <strong>${ttlMinutes} minutes</strong>.</div>
                <div style="height:16px;"></div>
                <div style="font-size:14px;font-weight:700;margin-bottom:6px;">How to use it</div>
                <ol style="margin:0;padding-left:18px;font-size:14px;line-height:20px;color:#374151;">
                  <li>Go back to the verification screen</li>
                  <li>Enter the code exactly as shown above</li>
                  <li>Continue to complete sign-in</li>
                </ol>
                <div style="height:18px;"></div>
                <div style="padding:14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;">
                  <div style="font-size:13px;font-weight:700;color:#9a3412;">Security notice</div>
                  <div style="font-size:13px;line-height:18px;color:#9a3412;margin-top:6px;">
                    Do not share this code with anyone (including support). If you did not request this code, you can safely ignore this email.
                  </div>
                </div>
                ${supportEmail ? `<div style="margin-top:18px;font-size:12px;color:#6b7280;">Need help? Contact: <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;">${supportEmail}</a></div>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;line-height:16px;color:#6b7280;">
                <div>Regards,</div>
                <div style="font-weight:700;color:#111827;margin-top:2px;">${brand} Team</div>
              </td>
            </tr>
          </table>
          <div style="max-width:600px;width:100%;font-size:11px;line-height:14px;color:#9ca3af;margin-top:10px;text-align:center;">
            Please do not reply to this email.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    const delivery = await sendEmail({ to: email, subject, text, html });

    return jsonResponse(res, {
      success: true,
      message: 'OTP created',
      delivery
    });
  } catch (e) {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
    return jsonResponse(
      res,
      { success: false, message: 'Failed to create OTP', ...(isDev ? { details: e?.message || String(e) } : {}) },
      500
    );
  }
}

export async function verifyOtp(req, res) {
  const emailRaw = req.body?.email;
  const otp = String(req.body?.otp || '').trim();
  const email = normalizeEmail(emailRaw);
  try {
    const row = await knex('email_otps')
      .whereRaw('lower(email) = lower(?)', [email])
      .andWhere('used_at', null)
      .orderBy('created_at', 'desc')
      .first();

    if (!row) {
      return jsonResponse(res, { success: false, message: 'OTP not found' }, 404);
    }

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return jsonResponse(res, { success: false, message: 'OTP expired' }, 400);
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    const attempts = Number(row.attempts || 0);
    if (attempts >= maxAttempts) {
      return jsonResponse(res, { success: false, message: 'Too many attempts' }, 429);
    }

    const computed = hashOtp(otp, row.otp_salt);
    if (computed !== row.otp_hash) {
      await knex('email_otps').where({ id: row.id }).update({ attempts: attempts + 1 });
      return jsonResponse(res, { success: false, message: 'Invalid OTP' }, 400);
    }

    return jsonResponse(res, { success: true, message: 'OTP verified' });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Failed to verify OTP' }, 500);
  }
}

export async function resetPasswordWithOtp(req, res) {
  const emailRaw = req.body?.email;
  const otp = String(req.body?.otp || '').trim();
  const newPassword = req.body?.newPassword;
  const email = normalizeEmail(emailRaw);

  if (!email || !otp || !newPassword) {
    return jsonResponse(res, { success: false, message: 'Email, otp, and newPassword are required' }, 400);
  }

  try {
    const user = await knex('auth_users').select(['id', 'email']).whereRaw('lower(email) = lower(?)', [email]).first();
    if (!user?.id) return jsonResponse(res, { success: false, message: 'User not found' }, 404);

    const row = await knex('email_otps')
      .whereRaw('lower(email) = lower(?)', [email])
      .andWhere('used_at', null)
      .orderBy('created_at', 'desc')
      .first();

    if (!row) return jsonResponse(res, { success: false, message: 'OTP not found' }, 404);

    const exp = row.expires_at ? new Date(row.expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return jsonResponse(res, { success: false, message: 'OTP expired' }, 400);
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS || 5);
    const attempts = Number(row.attempts || 0);
    if (attempts >= maxAttempts) {
      return jsonResponse(res, { success: false, message: 'Too many attempts' }, 429);
    }

    const computed = hashOtp(otp, row.otp_salt);
    if (computed !== row.otp_hash) {
      await knex('email_otps').where({ id: row.id }).update({ attempts: attempts + 1 });
      return jsonResponse(res, { success: false, message: 'Invalid OTP' }, 400);
    }

    const cols = await knex('auth_users').columnInfo();
    const updates = {};
    const passRes = setDbPassword(updates, cols, String(newPassword));
    if (!passRes.ok) return jsonResponse(res, { success: false, message: passRes.error }, 500);

    if (cols.updated_at) updates.updated_at = knex.fn.now();
    if (cols.failed_login_attempts) updates.failed_login_attempts = 0;
    if (cols.locked_until) updates.locked_until = null;

    await knex('auth_users').where({ id: user.id }).update(updates);
    await knex('email_otps').where({ id: row.id }).update({ used_at: knex.fn.now() });

    return jsonResponse(res, { success: true, message: 'Password reset successfully' });
  } catch (e) {
    return jsonResponse(res, { success: false, message: 'Failed to reset password' }, 500);
  }
}
