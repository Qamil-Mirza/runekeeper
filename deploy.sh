#!/bin/bash
set -euo pipefail

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Pulling latest code..."
git pull origin deploy

echo "==> Checking Ollama models..."
for model in "${OLLAMA_MODEL:-qwen3:4b}" "${OLLAMA_MODEL_FAST:-qwen3:1.7b}"; do
  if ! ollama list | grep -q "$(echo "$model" | cut -d: -f1)"; then
    echo "    Pulling $model..."
    ollama pull "$model"
  fi
done

echo "==> Building and starting services..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for database to be ready..."
until docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec db pg_isready -U runekeeper 2>/dev/null; do
  sleep 1
done

echo "==> Running database migrations..."
set -a
source "$ENV_FILE"
set +a
export DATABASE_URL="postgresql://runekeeper:${POSTGRES_PASSWORD}@localhost:5432/runekeeper"
npx drizzle-kit push

echo "==> Deploy complete!"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
