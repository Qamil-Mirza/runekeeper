# Runekeeper Deployment Guide

## Architecture

- **Next.js app** — runs in Docker with standalone output
- **PostgreSQL** — runs in Docker with persistent volume
- **Google Gemini Flash** — cloud LLM API for chat intelligence
- **Tailscale Funnel** — provides public HTTPS access without a domain or port forwarding

## Prerequisites

- Docker and Docker Compose installed on the server
- Tailscale installed and authenticated (`curl -fsSL https://tailscale.com/install.sh | sh`)
- Node.js 18+ on the host (for running database migrations)
- Google Gemini API key (from [Google AI Studio](https://aistudio.google.com/apikey))

## Setup

### 1. Tailscale

Enable Tailscale SSH and Funnel:

```bash
sudo tailscale up --ssh
sudo tailscale funnel --bg 3000
```

Note your Funnel URL (e.g., `https://<machine>.<tailnet>.ts.net`).

### 2. Google OAuth

In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), add:

- **Authorized JavaScript origin:** your Funnel URL
- **Authorized redirect URI:** `<funnel-url>/api/auth/callback/google`

### 3. Environment Variables

Create `.env.production` in the project root (never commit this file):

```bash
# Database (use hex to avoid URL-unsafe characters like / and +)
POSTGRES_PASSWORD=<generate with: openssl rand -hex 24>

# Auth
AUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://<your-machine>.<tailnet>.ts.net
AUTH_GOOGLE_ID=<your google client id>
AUTH_GOOGLE_SECRET=<your google client secret>
TOKEN_ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Gemini
GEMINI_API_KEY=<your gemini api key>
```

### 4. Deploy

```bash
./deploy.sh
```

This pulls the latest code, builds the Docker images, starts the containers, and runs database migrations.

### 5. Verify

```bash
# Check containers are running
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Test locally
curl http://localhost:3000

# Test public access
curl https://<your-machine>.<tailnet>.ts.net
```

## Day-to-Day Deployment

From your dev machine:

```bash
git push origin deploy
```

Then SSH to the server and run:

```bash
cd ~/Code/runekeeper
./deploy.sh
```

## Useful Commands

```bash
# View app logs
docker compose -f docker-compose.prod.yml logs -f app

# View database logs
docker compose -f docker-compose.prod.yml logs -f db

# Restart the app
docker compose --env-file .env.production -f docker-compose.prod.yml restart app

# Stop everything
docker compose --env-file .env.production -f docker-compose.prod.yml down

# Stop and remove database volume (destructive!)
docker compose --env-file .env.production -f docker-compose.prod.yml down -v

# Open Drizzle Studio against production DB
DATABASE_URL="postgresql://runekeeper:<password>@localhost:5432/runekeeper" npx drizzle-kit studio
```

## Notes

- Containers use `restart: unless-stopped` — they survive reboots as long as Docker is enabled (`sudo systemctl enable docker`)
- Tailscale Funnel persists across reboots when started with `--bg`
- `AUTH_TRUST_HOST=true` is required for NextAuth v5 when running behind Tailscale Funnel (reverse proxy)
- Use `openssl rand -hex` (not `-base64`) for `POSTGRES_PASSWORD` to avoid URL-unsafe characters that break the `DATABASE_URL` connection string
