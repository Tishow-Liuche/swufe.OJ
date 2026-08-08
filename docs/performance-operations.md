# Production performance and capacity controls

The production Compose stack separates request handling from local judging:

- `caddy` serves the built SPA directly and gives fingerprinted `/assets/*` files a one-year immutable cache lifetime.
- `backend` handles API and WebSocket traffic only.
- `judge-worker` consumes the BullMQ local-judge queue without opening an HTTP port.
- `migrate` applies Prisma migrations once before API and worker startup.

## Small-host defaults

The checked-in defaults target a 2 GB host and favor stability over judge throughput:

```env
REDIS_MAXMEMORY=192mb
GO_JUDGE_PARALLELISM=1
JUDGE_WORKER_CONCURRENCY=1
JUDGE_QUEUE_MAX_WAITING=500
JUDGE_SUBMISSION_COOLDOWN_SECONDS=5
AUTH_USER_CACHE_TTL_MS=5000
```

Keep both judge concurrency values at `1` on a 2 GB server. Raising them without adding memory can cause swap pressure or OOM termination. On a dedicated judge node, increase them together after measuring representative submissions.

## Cloudflare cache rule

The origin emits these policies:

- `/assets/*`: `public, max-age=31536000, immutable`
- SPA routes and `index.html`: `no-cache`
- `/api/*` and `/socket.io/*`: `no-store`

Cloudflare should honor origin cache headers for static assets. Do not create a "Cache Everything" rule for `/api/*`.

## Deployment

```bash
docker compose \
  --env-file config/infra.env \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build --remove-orphans
```

After deployment, verify:

```bash
docker compose --env-file config/infra.env -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS https://your-domain.example/api/health
curl -I https://your-domain.example/assets/<fingerprinted-file>
```

The API health check deliberately avoids PostgreSQL queries. Container logs rotate at 10 MB with three files per service.
