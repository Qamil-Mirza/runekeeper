#!/bin/bash
set -euo pipefail

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Pulling latest code..."
git pull origin main

# Stamp the build with the deployed commit so the app can detect new versions.
export APP_VERSION="$(git rev-parse --short HEAD)"
echo "==> Building APP_VERSION=$APP_VERSION"

# Bring up the database first (no-op if already running) so the schema can be
# applied before the new app container starts serving — additive schema changes
# are backward-compatible, so the currently-running app tolerates them.
echo "==> Starting database..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db

echo "==> Waiting for database to be ready..."
until docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec db pg_isready -U runekeeper 2>/dev/null; do
  sleep 1
done

echo "==> Applying database schema (drizzle-kit push)..."
# Read ONLY the password from the env file — do not `source` it. It's a Docker
# env file, not a shell script: values like RESEND_FROM="Runekeeper <a@b.com>"
# contain shell metacharacters (< >) that make `source` fail with a syntax error.
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not found in $ENV_FILE}"
export DATABASE_URL="postgresql://runekeeper:${POSTGRES_PASSWORD}@localhost:5432/runekeeper"
npx drizzle-kit push

# Build and (re)start the app only after the schema is in place, so the new
# code never queries a column that doesn't exist yet.
echo "==> Building and starting application..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "==> Deploy complete!"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
