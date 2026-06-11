#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/apps/soc}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
HOST_ADDRESS="${HOST_ADDRESS:-0.0.0.0}"
PULL="${PULL:-false}"

cd "$APP_DIR"

if [ "$PULL" = "true" ] && [ -d .git ]; then
  git pull --ff-only
fi

export PATH="$HOME/.local/bin:$PATH"

uv sync

cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
npm run build

(fuser -k "${BACKEND_PORT}/tcp" || true) >/dev/null 2>&1
(fuser -k "${FRONTEND_PORT}/tcp" || true) >/dev/null 2>&1

cd "$APP_DIR"
nohup uv run uvicorn backend.main:app --host "$HOST_ADDRESS" --port "$BACKEND_PORT" > backend.log 2>&1 &
echo $! > backend.pid

cd "$APP_DIR/frontend"
nohup npm run preview:host > ../frontend.log 2>&1 &
echo $! > ../frontend.pid

sleep 3
echo "Backend:  http://$(hostname -I | awk '{print $1}'):${BACKEND_PORT}"
echo "Frontend: http://$(hostname -I | awk '{print $1}'):${FRONTEND_PORT}"
