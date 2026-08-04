// Security middleware with no external dependencies (audit surface stays small).
import { config } from '../config.js';

// ---------- security headers ----------
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // PHI must never be cached by intermediaries
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  if (config.env === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

// ---------- CORS allowlist (never reflect arbitrary origins) ----------
export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// ---------- rate limiting ----------
// In-memory per-pod. PRODUCTION: back with Redis so limits hold across pods.
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();

export const rateLimit = ({ windowMs = 60_000, max = 120, key = (req) => req.ip } = {}) =>
  (req, res, next) => {
    const k = `${req.baseUrl}${req.path}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(k, b); }
    b.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - b.count));
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ error: 'too many requests — please slow down' });
    }
    next();
  };

// Tight limit for credential endpoints; keyed on IP + submitted identity so one
// attacker cannot lock out every user from a shared NAT.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}:${(req.body?.email || req.body?.mfaToken || '').slice(0, 60)}`
});

// ---------- error handling that never leaks PHI or internals ----------
export function notFound(_req, res) {
  res.status(404).json({ error: 'not found' });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  // Log without request bodies — they routinely contain PHI.
  console.error(JSON.stringify({
    level: 'error', status, method: req.method, path: req.path,
    message: err.message, at: new Date().toISOString()
  }));
  res.status(status).json({ error: err.expose ? err.message : 'internal error' });
}
