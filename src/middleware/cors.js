import cors from 'cors';

function parseOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list;
}

export function corsMiddleware() {
  const whitelist = parseOrigins();
  const allowAll = whitelist.length === 0;
  return cors({
    origin: (origin, callback) => {
      if (allowAll || !origin || whitelist.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS not allowed'), false);
    },
    credentials: true
  });
}
