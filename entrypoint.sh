#!/bin/sh
set -e

echo "Waiting for Postgres to be ready..."
# Wait until Postgres responds to a simple query, not just the port open
until echo "SELECT 1;" | npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null 2>&1; do
  sleep 2
done

echo "Postgres ready! Generating Prisma client..."
npx prisma generate

echo "Generated prisma client! Running migrations..."
npx prisma migrate deploy

echo "Starting Next.js app..."
npm run dev