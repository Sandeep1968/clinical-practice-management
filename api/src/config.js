// Fail fast on unsafe configuration. A healthcare app must never boot in
// production with development defaults.
const PROD = process.env.NODE_ENV === 'production';

const problems = [];

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: +(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  requireMfaForStaff: process.env.REQUIRE_MFA === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // serve the built React app from this process (single-image deploys)
  serveStatic: process.env.SERVE_STATIC === 'true',
  // public demo with seeded fake data — surfaces a banner, blocks nothing
  demoMode: process.env.DEMO_MODE === 'true'
};

if (!config.jwtSecret || config.jwtSecret === 'change-me-in-prod' || config.jwtSecret === 'dev-secret') {
  if (PROD) problems.push('JWT_SECRET is missing or still the default value');
  else config.jwtSecret = config.jwtSecret || 'dev-secret-not-for-production';
}
if (config.jwtSecret && config.jwtSecret.length < 32 && PROD) {
  problems.push('JWT_SECRET must be at least 32 characters');
}
if (!config.databaseUrl) {
  if (PROD) problems.push('DATABASE_URL is required');
  else config.databaseUrl = 'postgres://app_user:app_pass@localhost:5432/cpm';
}
if (PROD && config.databaseUrl?.includes('app_pass')) {
  problems.push('DATABASE_URL still uses the default development password');
}
// same-origin deploys serve the SPA from this process, so no CORS allowlist is needed
if (PROD && !config.serveStatic && config.corsOrigins.some(o => o.includes('localhost'))) {
  problems.push('CORS_ORIGINS contains localhost in production');
}
// Must be an explicit decision. "false" is only defensible on an encrypted
// private network (e.g. Fly 6PN / WireGuard); anything public needs "true".
if (PROD && process.env.DATABASE_SSL === undefined) {
  problems.push('DATABASE_SSL must be set explicitly ("true", or "false" only on a private encrypted network)');
}

if (problems.length) {
  console.error('\n✗ Refusing to start — unsafe configuration:\n');
  problems.forEach(p => console.error(`   • ${p}`));
  console.error('\nSee COMPLIANCE.md and .env.example.\n');
  process.exit(1);
}

if (!PROD) {
  console.warn('⚠  Running in development mode — not suitable for real patient data.');
}
