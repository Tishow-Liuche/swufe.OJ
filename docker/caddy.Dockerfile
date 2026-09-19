FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY packages/frontend/package*.json ./
RUN npm ci

COPY packages/frontend ./
RUN npm run build

FROM caddy:2.8-alpine

COPY --from=frontend-build /app/frontend/dist /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
