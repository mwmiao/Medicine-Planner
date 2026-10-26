# Etapa 1: testar e gerar a versão estática (pasta out/).
# O resultado não depende do processador, por isso corre só na plataforma nativa do build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# Etapa 2: servidor Node — serve a app, guarda os dados em /data e envia lembretes Web Push.
FROM node:22-alpine
ENV NODE_ENV=production PORT=1380 STATIC_DIR=/app/out DATA_DIR=/data
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/server.mjs server/push.mjs ./
COPY --from=build /app/out /app/out
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 1380
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:1380/api/health || exit 1
CMD ["node", "server.mjs"]
