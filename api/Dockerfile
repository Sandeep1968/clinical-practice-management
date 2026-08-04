# Build context is the repo root (see docker-compose.yml) so migrations are included
FROM node:22-alpine

# Run as a non-root user — a container compromise should not be root
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY api/package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY api/ .
COPY db/ ./db/

RUN chown -R app:app /app
USER app

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# NOTE: migrations run here for local/dev convenience only.
# In production run them as a separate job/init-container so concurrent
# replicas cannot race each other applying the same migration.
CMD ["npm", "start"]
