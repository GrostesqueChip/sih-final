/**
 * Deterministic demo launcher.
 *
 * Forces the in-memory demo database regardless of what is installed on the
 * machine, then boots the normal server. Cross-platform (no shell env syntax),
 * so `npm run demo` behaves identically on Windows, macOS and Linux.
 *
 * Use this for evaluation / offline demos. Use `npm run dev` / `npm start`
 * for the PostgreSQL-backed path.
 */
process.env.NAWI_DB_MODE = 'memory';

// Stable, clearly-labelled demo secrets so officer sign-ins survive a server
// restart and seals stay reproducible during an evaluation. Production reads
// real secrets from the environment and refuses to start without them.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'nawi-demo-only-jwt-secret-not-for-production-use-2026';
process.env.HMAC_SECRET = process.env.HMAC_SECRET || 'nawi-demo-only-hmac-seal-key-not-for-production-use-2026';
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// Pin the API port. The Vite dev server proxies /api to :5000, so an inherited
// PORT from the surrounding shell (CI runners, IDE preview harnesses and PaaS
// shims all set one) would silently move the API out from under the proxy — or
// collide with the client itself. Override with NAWI_API_PORT if 5000 is taken.
process.env.PORT = process.env.NAWI_API_PORT || '5000';

require('./src/index.js').startServer();
