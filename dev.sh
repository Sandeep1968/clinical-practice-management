#!/usr/bin/env bash
# Fresh start — use this whenever the UI looks stale.
set -e
cd "$(dirname "$0")"

echo "→ stopping containers"
docker compose down

echo "→ rebuilding images (no cache)"
docker compose build --no-cache

echo "→ starting stack"
docker compose up -d

echo
echo "✅ Running:"
echo "   landing   http://localhost:5173"
echo "   portal    http://localhost:5173/portal"
echo "   platform  http://localhost:5173/platform"
echo
echo "If the browser still shows an old page:"
echo "   1. open a PRIVATE / INCOGNITO window, or"
echo "   2. DevTools (Cmd+Option+I) → Network tab → tick 'Disable cache' → refresh"
echo
docker compose logs -f web
