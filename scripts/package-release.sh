#!/usr/bin/env bash
# Baut die portablen Versionen und legt sie in ./release ab.
#   - Linux:   Spiel-des-Lebens-<version>-x86_64.AppImage
#   - Windows: Spiel-des-Lebens-<version>-windows-portable.zip (nur wenn cargo-xwin installiert ist)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
OUT=release
mkdir -p "$OUT"

echo "==> Engine-Tests"
cargo test -p life-engine --quiet

echo "==> Linux AppImage"
npm run build:linux
APPIMAGE=$(ls -t target/release/bundle/appimage/*.AppImage | head -n1)
cp "$APPIMAGE" "$OUT/Spiel-des-Lebens-$VERSION-x86_64.AppImage"
chmod +x "$OUT/Spiel-des-Lebens-$VERSION-x86_64.AppImage"

if command -v cargo-xwin >/dev/null; then
  echo "==> Windows portable .exe (Cross-Compile)"
  npm run build:windows
  EXE=target/x86_64-pc-windows-msvc/release/spiel-des-lebens.exe
  STAGE=$(mktemp -d)
  mkdir -p "$STAGE/Spiel-des-Lebens"
  cp "$EXE" "$STAGE/Spiel-des-Lebens/Spiel-des-Lebens.exe"
  cat > "$STAGE/Spiel-des-Lebens/LIESMICH.txt" <<'TXT'
Spiel des Lebens - portable Version

Starten: Spiel-des-Lebens.exe doppelklicken. Keine Installation noetig.
Benoetigt die Microsoft Edge WebView2-Runtime (bei Windows 10/11 vorinstalliert).

Eigene Regeln und Muster werden im Ordner "gameoflife-data" neben der .exe
gespeichert - den ganzen Ordner einfach weitergeben oder auf einen USB-Stick kopieren.
TXT
  (cd "$STAGE" && zip -qr - Spiel-des-Lebens) > "$OUT/Spiel-des-Lebens-$VERSION-windows-portable.zip"
  rm -rf "$STAGE"
else
  echo "-- cargo-xwin nicht gefunden, Windows-Build uebersprungen (bash scripts/setup-ubuntu.sh --windows)"
fi

echo
ls -lh "$OUT"
