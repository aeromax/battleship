#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  echo "This script requires bash. Run: bash $0 [port]" >&2
  exit 2
fi

set -euo pipefail

PORT="${1:-4001}"

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -iTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
elif command -v ss >/dev/null 2>&1; then
  PIDS="$(
    ss -ltnp "sport = :${PORT}" 2>/dev/null \
      | awk -F'pid=' 'NR>1 {split($2,a,/,/); print a[1]}' \
      | tr -d ')' \
      | tr ' ' '\n' \
      | sed '/^$/d' \
      | sort -u
  )"
else
  echo "Neither lsof nor ss found. Install one to detect listeners." >&2
  exit 1
fi

if [ -z "${PIDS}" ]; then
  echo "No listeners on port ${PORT}."
  exit 0
fi

echo "Killing PIDs on port ${PORT}: ${PIDS}"
kill ${PIDS}
sleep 0.2

if command -v lsof >/dev/null 2>&1; then
  if lsof -t -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port ${PORT} still in use."
    exit 1
  fi
fi

echo "Port ${PORT} is free."
