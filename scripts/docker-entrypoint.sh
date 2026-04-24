#!/usr/bin/env sh
set -eu

mkdir -p /app/data /app/public/artifacts

npx prisma generate
npx prisma migrate deploy

exec "$@"
