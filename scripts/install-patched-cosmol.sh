#!/usr/bin/env bash
# Install the vendored, camera/frame-patched COSMol WASM package.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/webapp/node_modules/@cosmol-studio/cosmol-viewer"
mkdir -p "$DEST"
cp -a "$ROOT/vendor/cosmol-viewer/." "$DEST/"
grep -q 'cameraState' "$DEST/cosmol_viewer_wasm.d.ts"
echo "installed patched COSMol package into $DEST"
