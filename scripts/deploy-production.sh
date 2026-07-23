#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
umask 077

compose() {
  sudo docker compose \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
    --env-file config/infra.env \
    "$@"
}

random_hex() {
  openssl rand -hex "$1"
}

set_env() {
  local key="$1"
  local value="$2"
  local file="config/app.prod.env"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

if [[ -n "${OJ_DOMAIN:-}" ]]; then
  printf 'OJ_DOMAIN=%s\n' "$OJ_DOMAIN" > config/proxy.env
fi

if [[ ! -f config/proxy.env ]]; then
  echo "Set OJ_DOMAIN to the public DNS name before deployment." >&2
  exit 1
fi

oj_domain="$(sed -n 's/^OJ_DOMAIN=//p' config/proxy.env)"
if [[ -z "$oj_domain" ]]; then
  echo "config/proxy.env does not define OJ_DOMAIN." >&2
  exit 1
fi

if [[ ! -f config/infra.env ]]; then
  postgres_password="$(random_hex 24)"
  redis_password="$(random_hex 24)"
  minio_user="oj$(random_hex 6)"
  minio_password="$(random_hex 24)"

  cat > config/infra.env <<EOF
POSTGRES_USER=oj
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=oj_platform
REDIS_PASSWORD=${redis_password}
MINIO_ROOT_USER=${minio_user}
MINIO_ROOT_PASSWORD=${minio_password}
EOF
fi

if [[ ! -f config/app.prod.env ]]; then
  postgres_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' config/infra.env)"
  redis_password="$(sed -n 's/^REDIS_PASSWORD=//p' config/infra.env)"
  minio_user="$(sed -n 's/^MINIO_ROOT_USER=//p' config/infra.env)"
  minio_password="$(sed -n 's/^MINIO_ROOT_PASSWORD=//p' config/infra.env)"

  cat > config/app.prod.env <<EOF
DATABASE_URL="postgresql://oj:${postgres_password}@postgres:5432/oj_platform"
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
JWT_ACCESS_SECRET=$(random_hex 48)
JWT_REFRESH_SECRET=$(random_hex 48)
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
S3_ENDPOINT=minio
S3_PORT=9000
S3_ACCESS_KEY=${minio_user}
S3_SECRET_KEY=${minio_password}
S3_BUCKET=oj-testdata
S3_USE_SSL=false
S3_REGION=us-east-1
S3_PUBLIC_ENDPOINT=${oj_domain}
S3_PUBLIC_PORT=443
S3_PUBLIC_USE_SSL=true
GO_JUDGE_URL=http://go-judge:5050
GO_JUDGE_AUTH_TOKEN=
APP_PORT=3000
APP_HOST=0.0.0.0
NODE_ENV=production
COOKIE_SECURE=true
TRUST_PROXY=true
SENTRY_DSN=
EOF
else
  set_env S3_ENDPOINT minio
  set_env S3_PORT 9000
  set_env S3_USE_SSL false
  set_env S3_REGION us-east-1
  set_env S3_PUBLIC_ENDPOINT "$oj_domain"
  set_env S3_PUBLIC_PORT 443
  set_env S3_PUBLIC_USE_SSL true
  set_env COOKIE_SECURE true
  set_env TRUST_PROXY true
fi

compose up -d --build

for attempt in $(seq 1 45); do
  if compose exec -T backend wget -q --spider http://127.0.0.1:3000/; then
    break
  fi

  if [[ "$attempt" == "45" ]]; then
    compose ps
    compose logs --tail=120 backend
    exit 1
  fi

  sleep 2
done

if [[ "${SEED_DEMO_DATA:-0}" == "1" ]]; then
  compose exec -T backend npm run seed
fi

compose ps
