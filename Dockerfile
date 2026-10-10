FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_WS_PORT=3001
ENV NEXT_PUBLIC_WS_PORT=$NEXT_PUBLIC_WS_PORT
# NEXT_PUBLIC_* vars are inlined at build time, so the Goggins UI flag must be
# passed as a build arg (not just a runtime env) to show the settings section.
ARG NEXT_PUBLIC_GOGGINS_CALLS_ENABLED=false
ENV NEXT_PUBLIC_GOGGINS_CALLS_ENABLED=$NEXT_PUBLIC_GOGGINS_CALLS_ENABLED
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Build stamp (git short SHA) so the running app can detect new deployments.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Dedicated identity that collides with no account or group on the host: the
# host kernel sees a container's uid as its own, so sharing one with a real
# login account lets that account signal the app and, with a matching group,
# read its environment. Reserved on the host as "runekeeper-app".
# See docs/lab/2026-10-10-lab-container-identity.md.
ARG APP_UID=61010
ARG APP_GID=61010
RUN addgroup --system --gid ${APP_GID} runekeeper && \
    adduser --system --uid ${APP_UID} --ingroup runekeeper runekeeper

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Custom server needs full node_modules (standalone trace is incomplete)
COPY --from=prod-deps /app/node_modules ./node_modules

# Numeric, so the identity does not depend on a name lookup in the image.
USER ${APP_UID}:${APP_GID}
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server-custom.js"]
