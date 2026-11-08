# syntax=docker/dockerfile:1

# Ongaku: Node server and Angular client in one image.
# See docs/docker.md to run it with Redis and put it behind nginx.

ARG NODE_VERSION=24

# --- Angular client ---------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS client
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
# ng2-dragula does not declare Angular 20+ in its peer dependencies yet
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY client/ ./
RUN npx ng build --configuration production

# --- Server dependencies ----------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
# The optional dependencies are left out: identicon and node-wave (from a
# git+ssh repository) are native modules the server works without, and
# webtorrent with parse-torrent only download the .torrent files dropped in
# the library: the image does not download torrents. node-wave is missing from the
# lock file, so npm ci can't be used.
RUN npm pkg delete optionalDependencies \
  && npm install --omit=dev --ignore-scripts --no-audit --no-fund

# --- Runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim
# ffmpeg: transcoding of the formats browsers can't play, and tag reading
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public/img ./public/img
COPY docker/application.yml ./server/config/application.yml
COPY --from=client /build/client/dist ./client/dist

# Written at runtime: user images and uploads, artist pictures, lyrics
RUN mkdir -p public/user public/artists-covers public/lyrics \
  && chown -R node:node public
USER node

# Port of server/config/config.yml for NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/public/user", "/app/public/artists-covers", "/app/public/lyrics"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/index.js"]
