#!/usr/bin/env bash
# Vercel build: generate the Prisma client, bring the database schema up to date,
# seed the demo register on the very first deploy only, then build the web app.
set -euo pipefail

SCHEMA=server/prisma/schema.prisma

npx prisma generate --schema "$SCHEMA"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Connect a Postgres database (e.g. Neon) to this Vercel project." >&2
  exit 1
fi
if [ -z "${HMAC_SECRET:-}" ] || [ -z "${JWT_SECRET:-}" ]; then
  echo "ERROR: set HMAC_SECRET and JWT_SECRET in the Vercel project's environment variables." >&2
  echo "       Certificates are sealed with HMAC_SECRET, so it must never change after the first deploy." >&2
  exit 1
fi

# Migrations need a direct (non-pooled) connection when the provider offers one.
MIGRATE_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"
DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy --schema "$SCHEMA"
DATABASE_URL="$MIGRATE_URL" node server/prisma/seed.js --if-empty

npm run build --workspace=client
