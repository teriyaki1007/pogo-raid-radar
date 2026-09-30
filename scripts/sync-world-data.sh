#!/usr/bin/env bash
# Replace apps/world/data/ with World Watch output from /workspace/world-data/ (if present).
# Otherwise keep the bundled sample data.
set -euo pipefail
SRC="${WORLD_DATA_DIR:-/workspace/world-data}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/apps/world/data"
if [ -f "$SRC/index.json" ] && compgen -G "$SRC/countries/*.json" >/dev/null; then
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$SRC/index.json"
  for f in "$SRC"/countries/*.json; do node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$f"; done
  rm -rf "$DEST"; mkdir -p "$DEST"
  cp -a "$SRC/index.json" "$DEST/index.json"
  cp -a "$SRC/countries" "$DEST/countries"
  echo "sync-world-data: replaced apps/world/data with $SRC ($(ls "$DEST/countries" | wc -l) countries)"
else
  echo "sync-world-data: no real data in $SRC; keeping existing apps/world/data (samples)"
fi
