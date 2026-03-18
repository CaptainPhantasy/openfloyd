FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runtime

RUN apk add --no-cache \
  build-base \
  python3

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY config/ ./config/

RUN addgroup -g 1001 -S floyd && \
  adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G floyd -g floyd floyd

RUN mkdir -p /app/workspace /app/wa_auth && \
  chown -R floyd:floyd /app/workspace /app/wa_auth

USER floyd

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node dist/healthcheck.js || exit 1

CMD ["node", "dist/index.js"]
