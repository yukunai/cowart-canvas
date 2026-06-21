#!/bin/zsh
set -euo pipefail

label="com.seek.cowart-canvas"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
port="${COWART_CANVAS_PORT:-43219}"
npm_path="$(command -v npm || true)"
npm_dir="$(dirname "$npm_path")"
launch_path="$npm_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

if [ -z "$npm_path" ]; then
  echo "npm was not found. Install Node.js first, then run this script again." >&2
  exit 1
fi

cd "$project_dir"
npm install

mkdir -p "$HOME/Library/LaunchAgents"
chmod +x "$script_dir/start-cowart-canvas.sh"
chmod +x "$script_dir/open-cowart-canvas.sh"

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$(xml_escape "$script_dir/start-cowart-canvas.sh")</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$project_dir")</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/cowart-canvas.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/cowart-canvas.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$launch_path</string>
    <key>COWART_CANVAS_PORT</key>
    <string>$(xml_escape "$port")</string>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "$domain" "$plist" >/dev/null 2>&1 || true
launchctl bootstrap "$domain" "$plist"
launchctl kickstart -k "$domain/$label"

"$script_dir/open-cowart-canvas.sh"

echo "Cowart Canvas is running at http://127.0.0.1:${port}/?installed=1"
