FROM node:22-alpine AS backend-build

RUN apk add --no-cache openssl

WORKDIR /app/backend
COPY packages/backend/package*.json ./
RUN npm ci

COPY packages/backend ./
RUN npx prisma generate --schema=prisma/schema.prisma && npm run build


FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY packages/frontend/package*.json ./
RUN npm ci

COPY packages/frontend ./
RUN npm run build


FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# Keep the Prisma CLI and seed inputs so migrations and the optional demo seed
# can run from the same immutable image.
COPY --from=backend-build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=backend-build --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=backend-build --chown=node:node /app/backend/prisma ./backend/prisma
COPY --from=backend-build --chown=node:node /app/backend/scripts ./backend/scripts
COPY --from=backend-build --chown=node:node /app/backend/tsconfig.json ./backend/tsconfig.json
COPY --from=frontend-build --chown=node:node /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
USER node
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
