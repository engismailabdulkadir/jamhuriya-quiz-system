#!/usr/bin/env sh
set -e

if [ ! -f .env ]; then
  cp .env.example .env
fi

# Ensure Laravel key exists in cloud runtime.
if [ -z "${APP_KEY}" ]; then
  php artisan key:generate --force
fi

# Keep runtime config fresh for cloud env vars.
php artisan optimize:clear

tries=0
until php artisan migrate --force; do
  tries=$((tries + 1))
  if [ "$tries" -ge 20 ]; then
    echo "Database migration failed after multiple retries."
    exit 1
  fi
  echo "Database not ready yet. Retrying in 3 seconds..."
  sleep 3
done

php artisan serve --host=0.0.0.0 --port="${PORT:-10000}"
