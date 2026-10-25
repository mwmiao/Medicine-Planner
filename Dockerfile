# Etapa 1: testar e gerar a versão estática (pasta out/).
# O resultado não depende do processador, por isso corre só na plataforma nativa do build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# Etapa 2: servidor Node sem dependências — serve a app e guarda os dados em /data.
FROM node:22-alpine
ENV NODE_ENV=production PORT=1380 STATIC_DIR=/app/out DATA_DIR=/data
WORKDIR /app
COPY server/server.mjs ./server/server.mjs
COPY --from=build /app/out ./out
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 1380
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:1380/api/health || exit 1
CMD ["node", "server/server.mjs"]
