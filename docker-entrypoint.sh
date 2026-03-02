#!/bin/sh
set -eu

DB_PATH="${DB_PATH:-/app/data/jetllm.db}"
DB_DIR="$(dirname "$DB_PATH")"

mkdir -p "$DB_DIR"

# Avoid recursive ownership rewrites on every boot; only fix what is not writable.
if ! gosu nextjs test -w "$DB_DIR"; then
  chown nextjs:nodejs "$DB_DIR"
fi

if [ -e "$DB_PATH" ] && ! gosu nextjs test -w "$DB_PATH"; then
  chown nextjs:nodejs "$DB_PATH"
fi

for suffix in -wal -shm; do
  sidecar="${DB_PATH}${suffix}"
  if [ -e "$sidecar" ] && ! gosu nextjs test -w "$sidecar"; then
    chown nextjs:nodejs "$sidecar"
  fi
done

exec gosu nextjs "$@"
