#!/bin/bash
# ASTRAL VANGUARD — Iron Requiem : one-click local launcher.
# Double-click on macOS, or run `bash start.command`. Starts a tiny local
# server and opens your browser. Same-Wi-Fi LAN URL is printed for phones.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"

# pick a server runtime
if command -v node >/dev/null 2>&1; then
  RUN=(node tools/serve.mjs)
elif command -v python3 >/dev/null 2>&1; then
  RUN=(python3 -m http.server "$PORT")
elif command -v python >/dev/null 2>&1; then
  RUN=(python -m SimpleHTTPServer "$PORT")
else
  echo "Need Node or Python to serve. (You can also just double-click index.html.)"
  read -r -p "Press Enter to exit..."; exit 1
fi

# print LAN IP for phone/tablet on the same Wi-Fi
IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo "============================================================"
echo "  ASTRAL VANGUARD — Iron Requiem"
echo "  This computer : http://localhost:$PORT"
[ -n "$IP" ] && echo "  Phone/tablet  : http://$IP:$PORT   (same Wi-Fi)"
echo "  Press Ctrl+C to stop."
echo "============================================================"

# open default browser (macOS `open`, Linux `xdg-open`)
( sleep 1; (open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null) ) &

PORT="$PORT" "${RUN[@]}"
