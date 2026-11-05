#!/usr/bin/env bash
# Baut die Engine nach WebAssembly und erzeugt die JS-Bindings in src/wasm/pkg.
# Wird von "npm run build:web" und vom GitHub-Pages-Workflow genutzt.
set -euo pipefail
cd "$(dirname "$0")/.."

rustup target add wasm32-unknown-unknown >/dev/null

# wasm-bindgen-cli muss exakt zur Crate-Version aus Cargo.lock passen
VERSION=$(cargo metadata --format-version 1 | node -e '
  let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => {
    const p = JSON.parse(s).packages.find(p => p.name === "wasm-bindgen");
    if (!p) { console.error("wasm-bindgen nicht in Cargo.lock"); process.exit(1); }
    console.log(p.version);
  });')

if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != *" $VERSION"* ]]; then
  echo "==> wasm-bindgen-cli $VERSION installieren"
  cargo install wasm-bindgen-cli --version "$VERSION" --locked
fi

echo "==> Engine nach wasm32 kompilieren"
cargo build -p life-engine-wasm --target wasm32-unknown-unknown --release

echo "==> JS-Bindings erzeugen"
rm -rf src/wasm/pkg
wasm-bindgen --target web --out-dir src/wasm/pkg --out-name life_engine_wasm \
  target/wasm32-unknown-unknown/release/life_engine_wasm.wasm

ls -lh src/wasm/pkg
