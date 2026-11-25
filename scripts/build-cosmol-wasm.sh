#!/usr/bin/env bash
# Rebuild COSMol Viewer WASM with the camera/frame patch and install it into webapp.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$ROOT/COSMol-viewer"
if [ ! -d "$REPO" ]; then REPO="$ROOT/COSMol-viewer-main"; fi
TARGET_DIR="$ROOT/target"
DEST="$ROOT/webapp/node_modules/@cosmol-studio/cosmol-viewer"
BINDGEN="${WASM_BINDGEN:-wasm-bindgen}"

cd "$REPO"

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
  rustup target add wasm32-unknown-unknown
fi

CARGO_TARGET_DIR="$TARGET_DIR" cargo build -p cosmol_viewer_wasm \
  --target wasm32-unknown-unknown --release --locked

WASM="$TARGET_DIR/wasm32-unknown-unknown/release/cosmol_viewer_wasm.wasm"
if command -v "$BINDGEN" >/dev/null 2>&1; then
  "$BINDGEN" --target web --out-dir wasm/pkg --out-name cosmol_viewer_wasm "$WASM"
else
  echo "wasm-bindgen not found; install wasm-bindgen-cli 0.2.129 or set WASM_BINDGEN" >&2
  exit 1
fi

cp wasm/pkg/cosmol_viewer_wasm.js \
   wasm/pkg/cosmol_viewer_wasm.d.ts \
   wasm/pkg/cosmol_viewer_wasm_bg.wasm \
   wasm/pkg/cosmol_viewer_wasm_bg.wasm.d.ts \
   "$DEST/"

# The npm entry point wires the JS constructors into the WASM SceneInput bridge.
python3 - "$DEST/index.js" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
text = text.replace(
    "import initWasm, { __setCkTypes, __setViewerTypes, Selection, Sphere, Stick, Style } from \"./cosmol_viewer_wasm.js\";",
    "import initWasm, { __setCkTypes, __setViewerTypes, Mesh, Selection, Sphere, Stick, Style } from \"./cosmol_viewer_wasm.js\";",
)
text = text.replace(
    "__setViewerTypes(Selection, Sphere, Stick, Style);",
    "__setViewerTypes(Selection, Sphere, Stick, Mesh, Style);",
)
path.write_text(text)
PY

grep -q 'cameraState' "$DEST/cosmol_viewer_wasm.d.ts"
echo "patched COSMol WASM installed into $DEST"
