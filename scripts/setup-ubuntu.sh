#!/usr/bin/env bash
# Einmalige Einrichtung der Build-Umgebung auf Ubuntu 22.04/24.04.
#   bash scripts/setup-ubuntu.sh            -> Linux (AppImage)
#   bash scripts/setup-ubuntu.sh --windows  -> zusaetzlich Cross-Build fuer Windows (.exe)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Systempakete fuer Tauri (offizielle Liste)"
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
# AppImages brauchen unter Ubuntu 24.04 FUSE 2 zum Starten
sudo apt-get install -y libfuse2t64 2>/dev/null || sudo apt-get install -y libfuse2 || true

if ! command -v cargo >/dev/null; then
  echo "==> Rust installieren (rustup)"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if ! command -v node >/dev/null; then
  echo "!! Node.js fehlt. Empfohlen: Node 20 LTS oder neuer (z. B. via nvm)." >&2
  exit 1
fi

if [[ "${1:-}" == "--windows" ]]; then
  echo "==> Windows-Cross-Compile (cargo-xwin, siehe v2.tauri.app/distribute/windows-installer)"
  sudo apt-get install -y nsis lld llvm clang
  rustup target add x86_64-pc-windows-msvc
  cargo install --locked cargo-xwin
fi

echo "==> npm-Abhaengigkeiten"
npm install

echo
echo "Fertig. Weiter mit:"
echo "  npm run app           # Entwicklungsmodus"
echo "  npm run release       # portable Builds nach ./release"
