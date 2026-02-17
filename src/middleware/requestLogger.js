/* Request/Response logger with minimal masking */
export function requestResponseLogger(req, res, next) {
  const start = Date.now();
  const { method } = req;
  const url = req.originalUrl || req.url;

  // Clone and mask request body
  const body = safeClone(req.body);
  maskSecrets(body);

  // Keep original res.json
  const originalJson = res.json.bind(res);

  res.json = function loggedJson(payload) {
    // Clone and mask response payload
    const out = safeClone(payload);
    maskSecrets(out);
    const ms = Date.now() - start;
    try {
      // eslint-disable-next-line no-console
      console.log(`[API] ${method} ${url} -> ${res.statusCode} (${ms} ms)\n  req.body:`, body, `\n  res.body:`, out);
    } catch (_) {}
    return originalJson(payload);
  };

  // Also log on error paths where res.json might not be used
  res.on('finish', () => {
    if (res.getHeader('content-type')?.toString().includes('application/json')) return; // logged above
    const ms = Date.now() - start;
    try {
      // eslint-disable-next-line no-console
      console.log(`[API] ${method} ${url} -> ${res.statusCode} (${ms} ms)\n  req.body:`, body);
    } catch (_) {}
  });

  next();
}

function safeClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
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

function maskString(str) {
  if (!str) return '';
  const visible = Math.min(2, str.length);
  return str.slice(0, visible) + '***';
}
