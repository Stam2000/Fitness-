# node:22-alpine embarque libssl3/libcrypto3, requis par Prisma (linux-musl-openssl-3.0.x).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Mode développement : `next dev` avec HMR. Le code source est synchronisé
# en continu par `docker compose watch` (voir docker-compose.yml, service « dev »).
FROM node:22-alpine AS dev
WORKDIR /app
# yt-dlp + ffmpeg : téléchargement des vidéos YouTube de démonstration.
# yt-dlp vient de GitHub (dernière release) et non d'apk : le paquet Alpine
# a des mois de retard, et un yt-dlp périmé déclenche les blocages YouTube
# (« Sign in to confirm you're not a bot »). Rebuilder l'image le met à jour.
RUN apk add --no-cache ffmpeg python3 \
  && wget -qO /usr/local/bin/yt-dlp \
       https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Étape de build — sert aussi de service « migrate » dans docker-compose
# (elle contient la CLI Prisma et tsx pour le seed).
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Dépendances de production seules. La CLI Prisma est dans « dependencies », donc
# cette étape suffit à appliquer les migrations depuis l'image finale — sans y
# embarquer les devDependencies (tsx, typescript, eslint…).
FROM node:22-alpine AS prisma-cli
WORKDIR /migrator
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Le reste des dépendances de production (Next, React…) pèse ~700 Mo et ne sert
# pas ici : le serveur applicatif, lui, tourne sur la sortie `standalone`.
RUN npm ci --omit=dev \
  && rm -rf node_modules/next node_modules/@next node_modules/react \
       node_modules/react-dom node_modules/geist node_modules/zod

# Image finale : serveur Next.js autonome, légère.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# La CLI Prisma interroge checkpoint.prisma.io au lancement (vérification de
# version) ; inutile ici, et cet appel traîne derrière un réseau sortant filtré.
ENV CHECKPOINT_DISABLE=1

# yt-dlp + ffmpeg : téléchargement des vidéos YouTube de démonstration.
# Dernière release GitHub plutôt qu'apk — voir le commentaire de l'étape dev.
RUN apk add --no-cache ffmpeg python3 \
  && wget -qO /usr/local/bin/yt-dlp \
       https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=prisma-cli --chown=nextjs:nodejs /migrator /migrator

USER nextjs
EXPOSE 3000

# Les migrations sont appliquées par le conteneur applicatif lui-même, au
# démarrage. Les faire porter par un conteneur séparé dont dépendait `app`
# rendait tout blocage invisible : `docker compose up` attendait sans fin.
# Les `timeout` garantissent un échec lisible (le conteneur redémarre) plutôt
# qu'un serveur figé avant même d'avoir écouté sur son port.
CMD ["sh", "-c", "cd /migrator \
  && timeout 120 ./node_modules/.bin/prisma migrate deploy \
  && timeout 120 node prisma/seed.mjs \
  && cd /app && exec node server.js"]
