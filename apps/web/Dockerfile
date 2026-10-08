# Abbild der Web-App fuer den eigenen Server (deploy/web).
#
# Gebaut wird aus der Repo-Wurzel, weil @tcm/core und @tcm/ui im Workspace
# liegen:  docker build -f apps/web/Dockerfile .
#
# Das fertige Abbild enthaelt nur den eigenstaendigen Next-Server
# (output: "standalone") - kein Quellcode, keine Entwicklungswerkzeuge.

FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Erst nur die Manifeste: solange sich keine Abhaengigkeit aendert, bleibt die
# Installation im Cache. Mobile und Expo werden gar nicht erst geholt.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter "@tcm/web..."

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/ui packages/ui
COPY apps/web apps/web

# NEXT_PUBLIC_* werden beim Bauen in das Client-Bundle eingebacken - zur
# Laufzeit gesetzt kaemen sie im Browser nie an.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
 && pnpm --filter @tcm/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Berlin
RUN apk add --no-cache tzdata

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
# /login ist ohne Anmeldung erreichbar und laeuft durch Middleware und Layout.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/login || exit 1
CMD ["node", "apps/web/server.js"]
