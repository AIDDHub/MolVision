#!/usr/bin/env bash
# Verify the installed COSMol WASM exposes camera + frame data.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/webapp/node_modules/@cosmol-studio/cosmol-viewer"
grep -q 'cameraState' "$DEST/cosmol_viewer_wasm.d.ts"
grep -q 'viewer_cameraState' "$DEST/cosmol_viewer_wasm.d.ts"
grep -q 'class Mesh' "$DEST/cosmol_viewer_wasm.d.ts"
grep -q '__setViewerTypes(Selection, Sphere, Stick, Mesh, Style)' "$DEST/index.js"
echo "patched COSMol camera API present"
