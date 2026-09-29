/**
 * Environment Bootstrap — Monorepo-aware, zero-setup safe.
 *
 * Problem this solves (SIH judge experience):
 * `.env` and `server/.env` are both git-ignored. On a fresh `git clone`, neither
 * exists, so the previous hard `process.exit(1)` on a missing JWT_SECRET meant the
 * backend never booted and the entire portal was dead on an evaluator's laptop.
 *
 * Policy implemented here:
 *   - PRODUCTION (`NODE_ENV=production`): missing secrets remain a FATAL error.
 *     A government portal must never boot with a predictable signing key.
 *   - DEVELOPMENT / TEST / DEMO: synthesise cryptographically-strong ephemeral
 *     secrets in memory, print an unmissable warning, and continue booting.
 *
 * The security control (SEC-CRIT-03: "no hardcoded secret fallbacks") is preserved —
 * nothing is hardcoded, the dev secrets are random per-process and are never written
 * to disk, so tokens minted by one dev run are worthless to the next.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REQUIRED_SECRETS = [
  {
    key: 'JWT_SECRET',
    purpose: 'signing officer authentication tokens',
    bytes: 48,
  },
  {
    key: 'HMAC_SECRET',
    purpose: 'computing the tamper-evident digital verification seal',
    bytes: 32,
  },
];

/**
 * Load .env files in increasing order of specificity. Later files do NOT override
 * values already set, which is dotenv's documented behaviour — so an explicit
 * process environment variable always wins over any file, and `server/.env` wins
 * over the repository-root `.env`.
 */
function loadDotEnvFiles() {
  const dotenv = require('dotenv');
  const serverRoot = path.resolve(__dirname, '..', '..');
  const repoRoot = path.resolve(serverRoot, '..');

  const candidates = [
    path.join(serverRoot, '.env'),
    path.join(repoRoot, '.env'),
  ];

  const loaded = [];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
      loaded.push(file);
    }
  }
  return loaded;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * @returns {{ loadedFiles: string[], generated: string[] }}
 * @throws when running in production with any required secret absent.
 */
function bootstrapEnv({ silent = false } = {}) {
  const loadedFiles = loadDotEnvFiles();
  const generated = [];

  for (const { key, purpose, bytes } of REQUIRED_SECRETS) {
    if (process.env[key] && process.env[key].trim().length > 0) continue;

    if (isProduction()) {
      const msg =
        `FATAL: ${key} environment variable is required in production for ${purpose}. ` +
        `Refusing to start with an unconfigured secret. Set ${key} in your environment or server/.env.`;
      console.error(msg);
      throw new Error(msg);
    }

    process.env[key] = crypto.randomBytes(bytes).toString('hex');
    generated.push(key);
  }

  if (generated.length > 0 && !silent && process.env.NODE_ENV !== 'test') {
    console.warn('');
    console.warn('  ┌──────────────────────────────────────────────────────────────────────┐');
    console.warn('  │  DEVELOPMENT MODE — EPHEMERAL SECRETS GENERATED                      │');
    console.warn('  ├──────────────────────────────────────────────────────────────────────┤');
    console.warn(`  │  No .env file supplied. Generated random: ${generated.join(', ').padEnd(25)}│`);
    console.warn('  │  These are regenerated on every restart, so existing officer login   │');
    console.warn('  │  tokens and digital seals become invalid when the server restarts.   │');
    console.warn('  │                                                                      │');
    console.warn('  │  For a stable local setup:  cp server/.env.example server/.env       │');
    console.warn('  │  Production deployments FAIL FAST instead of generating secrets.     │');
    console.warn('  └──────────────────────────────────────────────────────────────────────┘');
    console.warn('');
  }

  return { loadedFiles, generated };
}

module.exports = { bootstrapEnv, REQUIRED_SECRETS };
