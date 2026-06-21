#!/bin/zsh
set -euo pipefail

port="${COWART_CANVAS_PORT:-43219}"
open "http://127.0.0.1:${port}/?installed=1"
