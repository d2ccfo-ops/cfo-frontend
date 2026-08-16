# THE ONE THING TO UNDERSTAND ABOUT THIS FILE: NEXT_PUBLIC_* variables are not
# runtime configuration. `next build` substitutes their values into the client
# bundle as string literals, so they are frozen at BUILD time. Passing
# NEXT_PUBLIC_API_URL to `gcloud run deploy --set-env-vars` does nothing at all
# — the browser bundle already contains whatever value was present when the
# image was built, and if that was empty the app calls its own origin and every
# request 404s.
#
# That is why they arrive here as ARG, and why the deploy runbook builds the
# frontend only AFTER the backend has a URL. There is no way around the
# ordering; there is only knowing about it.
#
# CLERK_SECRET_KEY is the opposite case: it is read at RUNTIME, by proxy.js
# (Next 16's rename of middleware.js), which runs clerkMiddleware() on every
# request. It must never be an ARG — build arguments are recorded in image
# metadata and readable by anyone who can pull the image.

# ---------- deps ----------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/login
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL \
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL \
    NEXT_TELEMETRY_DISABLED=1

# Fails loudly here rather than shipping an image whose every API call goes to
# the wrong origin. A blank NEXT_PUBLIC_API_URL is not a misconfiguration you
# find in staging; it is one you find when a customer says nothing loads.
RUN test -n "$NEXT_PUBLIC_API_URL" || { echo "BUILD FAILED: --build-arg NEXT_PUBLIC_API_URL is required (it is baked into the client bundle)"; exit 1; }
RUN test -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" || { echo "BUILD FAILED: --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"; exit 1; }

RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# Next's standalone server binds `process.env.HOSTNAME || '0.0.0.0'`, and
# Docker sets HOSTNAME to the container ID. Left alone, the server tries to
# bind a hostname that resolves to nothing, Cloud Run's health check finds a
# closed port, and the revision is marked failed with no error in the logs.
# Pinning it is the documented fix, not a workaround.
ENV HOSTNAME=0.0.0.0

# The three pieces standalone splits its output into. Only server.js is traced
# automatically; static assets and public/ are copied by hand, by design, so
# they can be served from a CDN instead if you ever want that.
# --chown, because the server writes its fetch cache under .next/cache and
# COPY would otherwise leave everything owned by root for a process running as
# `node`.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
CMD ["node", "server.js"]
