# Single-image deploy: build the React app, then serve it from the Express API.
# One Fly app, same origin (no CORS), one process to pay for.

# ---------- stage 1: build the frontend ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ .
# same-origin in production: API calls go to /api on the same host
ENV VITE_API_URL=""
RUN npm run build

# ---------- stage 2: api + static assets ----------
FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY api/package*.json ./
RUN npm install --omit=dev

COPY api/ .
COPY db/ ./db/
COPY --from=web /web/dist ./public

RUN chown -R app:app /app
USER app

ENV NODE_ENV=production
ENV SERVE_STATIC=true
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
