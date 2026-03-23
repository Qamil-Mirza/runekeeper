#!/bin/bash
set -euo pipefail

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Pulling latest code..."
git pull origin deploy

echo "==> Building and starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for database to be ready..."
sleep 3

echo "==> Running database migrations..."
set -a
source "$ENV_FILE"
set +a
export DATABASE_URL="postgresql://runekeeper:${POSTGRES_PASSWORD}@localhost:5432/runekeeper"
npx drizzle-kit push

echo "==> Deploy complete!"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
