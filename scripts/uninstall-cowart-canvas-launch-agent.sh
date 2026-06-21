#!/bin/zsh
set -euo pipefail

label="com.seek.cowart-canvas"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

launchctl bootout "$domain" "$plist" >/dev/null 2>&1 || true
rm -f "$plist"

echo "Cowart Canvas launch agent removed."
