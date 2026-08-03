# Build context is the repo root (see docker-compose.yml) so migrations are included
FROM node:22-alpine
WORKDIR /app
COPY api/package*.json ./
RUN npm i --omit=dev
COPY api/ .
COPY db/ ./db/
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && npm run seed && npm start"]
