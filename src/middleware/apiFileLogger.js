import fs from 'fs';
import path from 'path';

function safeClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function maskString(str) {
  if (!str) return '';
  const visible = Math.min(2, str.length);
  return str.slice(0, visible) + '***';
}

function maskSecrets(obj) {
  if (!obj || typeof obj !== 'object') return;
  const SECRET_KEYS = ['password', 'pass', 'pwd', 'token', 'authorization', 'auth', 'secret'];
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (v && typeof v === 'object') stack.push(v);
      if (SECRET_KEYS.includes(k.toLowerCase())) {
        cur[k] = typeof v === 'string' ? maskString(v) : '***';
      }
    }
  }
}

function getLogStream(logFilePath) {
  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return fs.createWriteStream(logFilePath, { flags: 'a' });
}

export function apiFileLogger(options = {}) {
  const logFilePath = options.logFilePath || process.env.API_LOG_FILE || path.join(process.cwd(), 'logs', 'api.log');
  const stream = getLogStream(logFilePath);

  return function apiFileLoggerMiddleware(req, res, next) {
    const start = process.hrtime.bigint();

    const base = {
      ts: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString(),
      user_agent: req.get('user-agent') || ''
    };

    const reqBody = safeClone(req.body);
    maskSecrets(reqBody);

    const entry = {
      ...base,
      req: {
        headers: {
          'content-type': req.get('content-type') || undefined,
          'session-id': req.get('session-id') || undefined
        },
        query: req.query || {},
        params: req.params || {},
        body: reqBody
      },
      res: {
        status: null,
        body: null
      },
      duration_ms: null,
      user: null
    };

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    function finalize(payload) {
      const end = process.hrtime.bigint();
      entry.duration_ms = Number(end - start) / 1e6;
      entry.res.status = res.statusCode;

      const u = req.user || null;
      if (u && typeof u === 'object') {
        entry.user = { username: u.username, role: u.role };
      }

      if (payload !== undefined) {
        const out = safeClone(payload);
        maskSecrets(out);
        entry.res.body = out;
      }

      try {
        stream.write(JSON.stringify(entry) + '\n');
      } catch (_) {}
    }

    res.json = function loggedJson(payload) {
      finalize(payload);
      return originalJson(payload);
    };

    res.send = function loggedSend(payload) {
      const ctype = res.getHeader('content-type')?.toString() || '';
      if (ctype.includes('application/json')) {
        try {
          const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
          finalize(parsed);
        } catch (_) {
          finalize({ body: '[unparseable_json]' });
        }
      } else {
        finalize({ body: '[non_json_response]' });
      }
      return originalSend(payload);
    };

    res.on('finish', () => {
      if (entry.res.status != null) return;
      finalize();
    });

    next();
  };
}
