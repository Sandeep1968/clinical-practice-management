import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export function signAccess(user) {
  return jwt.sign({
    sub: user.id, tenantId: user.tenant_id, role: user.role,
    clinicianId: user.clinician_id || null, name: user.full_name
  }, SECRET, { expiresIn: '15m' });
}

export function signRefresh(user) {
  return jwt.sign({ sub: user.id, tenantId: user.tenant_id, typ: 'refresh' }, SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const claims = jwt.verify(token, SECRET);
    req.ctx = {
      userId: claims.sub, tenantId: claims.tenantId,
      role: claims.role, clinicianId: claims.clinicianId, ip: req.ip
    };
    next();
  } catch {
    res.status(401).json({ error: 'unauthenticated' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.ctx.role) ? next() : res.status(403).json({ error: 'forbidden' });

// Patient portal sessions (typ: 'portal') — scoped to one client
export function requirePortal(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const claims = jwt.verify(token, SECRET);
    if (claims.typ !== 'portal') throw new Error('not a portal token');
    req.ctx = {
      tenantId: claims.tenantId, clientId: claims.clientId,
      userId: claims.clientId, role: 'client', ip: req.ip
    };
    next();
  } catch {
    res.status(401).json({ error: 'unauthenticated' });
  }
}
