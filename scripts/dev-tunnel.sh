#!/bin/bash
set -euo pipefail

# Start Tailscale Funnel for local dev, run the server, and clean up on exit.
# Usage: npm run dev:tunnel

cleanup() {
  echo ""
  echo "==> Stopping Tailscale Funnel..."
  sudo tailscale funnel --bg off 2>/dev/null || true
  echo "==> Funnel stopped."
}

trap cleanup EXIT INT TERM

echo "==> Starting Tailscale Funnel on port 3000..."
sudo tailscale funnel --bg 3000

FUNNEL_URL=$(tailscale funnel status 2>/dev/null | grep -oE 'https://[^ ]+' | head -1 || true)
if [ -n "$FUNNEL_URL" ]; then
  echo "==> Public URL: $FUNNEL_URL"
  echo "==> OMI webhook: ${FUNNEL_URL}/api/integrations/omi/webhook?token=<your-secret>"
fi

echo "==> Starting dev server..."
npx tsx --env-file=.env server.ts
