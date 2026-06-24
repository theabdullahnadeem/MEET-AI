# Dockerfile for the LiveKit Agent worker (deployed to LiveKit Cloud).
# This is NOT used by the Next.js app — Vercel builds that separately.
# It runs the long-lived agent process that bridges meeting audio to
# OpenAI's GA Realtime API. See docs/AGENT_DEPLOY.md.
FROM node:22-slim

# ca-certificates is required for outbound TLS (LiveKit + OpenAI websockets).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies. patches/ must be present before `npm ci` because the
# postinstall step runs patch-package. devDependencies are kept so tsx is
# available to run the TypeScript agent directly.
COPY package*.json ./
COPY patches ./patches
RUN npm ci

COPY . .

# `start` puts the agent CLI into production mode.
CMD ["npm", "run", "start:agent"]
