# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build:isolated

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/dev.db
ENV ARTIFACT_STORAGE_ROOT=/app/public/artifacts

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next-build ./.next-build
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && mkdir -p /app/data /app/public/artifacts

EXPOSE 3000
VOLUME ["/app/data", "/app/public/artifacts"]
ENTRYPOINT ["dumb-init", "--", "/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start:docker"]
