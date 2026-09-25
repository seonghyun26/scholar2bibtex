#!/usr/bin/env bash
#
# Package the extension into a loadable / distributable zip.
#
#   ./build.sh            -> dist/scholar2bibtex-v<version>.zip
#                            dist/scholar2bibtex-v<version>/   (unpacked)
#   ./build.sh -o ~/Desk  -> writes both into that directory instead
#
# Only the files Chrome actually needs go in. Docs, the git repo, macOS junk and
# any previous build are left out, so the zip is exactly what "Load unpacked"
# expects. The unpacked folder is extracted from that zip rather than copied
# from the source tree, so what you load is byte-for-byte what you ship.

set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR="dist"
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out) OUT_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# Everything the extension loads at runtime. Keep this list in sync with
# manifest.json - a missing entry here is a broken zip, not a broken repo.
FILES=(
  manifest.json
  background.js
  content.js
  title-utils.js
  offscreen.html
  offscreen.js
  popup.html
  popup.css
  popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
  README.md
)

missing=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "aborting: files listed above are not present" >&2; exit 1; }

# Fail early on a syntax error rather than shipping a broken service worker.
if command -v node >/dev/null 2>&1; then
  for f in background.js content.js popup.js offscreen.js title-utils.js; do
    node --check "$f" >/dev/null || { echo "syntax error in $f" >&2; exit 1; }
  done
  node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8"))' \
    || { echo "manifest.json is not valid JSON" >&2; exit 1; }
fi

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$VERSION" ] || { echo "could not read version from manifest.json" >&2; exit 1; }

mkdir -p "$OUT_DIR"
ZIP="$OUT_DIR/scholar2bibtex-v$VERSION.zip"
UNPACKED="$OUT_DIR/scholar2bibtex-v$VERSION"
rm -f "$ZIP"

# -X drops the extra macOS attributes that otherwise add __MACOSX/ noise.
zip -q -X "$ZIP" "${FILES[@]}"

# Unpack it right back out so "Load unpacked" has a folder to point at without
# the user unzipping anything. Removed first: a stale file left behind from an
# older build would be loaded by Chrome even though it is not in the zip.
rm -rf "$UNPACKED"
mkdir -p "$UNPACKED"
unzip -q "$ZIP" -d "$UNPACKED"

echo "built  $ZIP"
echo "       version $VERSION, $(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files, $(du -h "$ZIP" | cut -f1)"
echo "       unpacked into $UNPACKED"
echo
echo "Install: open chrome://extensions, turn on Developer mode,"
echo "         click 'Load unpacked' and pick $UNPACKED"
