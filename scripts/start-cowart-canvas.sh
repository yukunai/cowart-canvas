#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$script_dir/.."

default_node_path="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH="${COWART_CANVAS_NODE_PATH:-$default_node_path}:$PATH"
export COWART_CANVAS_PORT="${COWART_CANVAS_PORT:-43219}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js first, then run this script again." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "node_modules was not found. Run npm install first." >&2
  exit 1
fi

exec npm run dev -- --host 127.0.0.1 --port "$COWART_CANVAS_PORT"
