# Spiel des Lebens – Regel-Labor

App zum Experimentieren mit zellulären Automaten.
Simulation in **Rust**, Oberfläche in **React**. Eine Codebasis, zwei Ziele:

- **Desktop** (Tauri 2): portabel als Windows-`.exe` oder Linux-AppImage, Simulation auf allen Kernen
- **Web** (GitHub Pages): dieselbe Rust-Engine als WebAssembly im Browser

## Funktionen

- **Regelfamilien**
  - *Life-like* (`B3/S23`, `23/3`)
  - *Generations* mit Verglimmen (`B2/S/C3`)
  - *Larger than Life / HROT* mit Radius 1–10 (`R5,C0,M1,S34..58,B34..45,NM`)
- **Nachbarschaften:** Moore, Von Neumann (`…V`), hexagonal (`…H`), jeweils mit beliebigem Radius
- **Regel-Baukasten:** Nachbarschaft, Radius, Zustände, „Zentrum mitzählen“, Geburt/Überleben per Chips oder als Bereich (`2-3,8`). Änderungen wirken sofort, auch während die Simulation läuft. Eine Vorschau zeigt, welche Zellen als Nachbarn zählen.
- **30 Regel-Vorlagen** (HighLife, Day & Night, Brian's Brain, Star Wars, Bosco's Rule …) und **eigene Regeln speichern**
- **Muster-Bibliothek** (Gleiter, Gosper Gun, Methusalems …) mit Platzier-Modus (Drehen, Spiegeln, Vorschau). RLE-Import und -Export als Text oder Datei, eigene Muster ablegen.
- **Zeichnen, Zoom, Pan:** Linksklick zeichnet (bzw. radiert auf lebenden Zellen), Rechtsklick radiert, Mausrad zoomt, Shift- oder Mittelklick-Ziehen verschiebt
- **Statistik:** Generation, Population, Δ, Maximum, tatsächliche Gen/s, Populationsverlauf
- **Welt:** 32–4096 Zellen pro Seite, Torus oder begrenzter Rand, Zufallsfüllung, Farben

## Portable Datenablage

Eigene Regeln und Muster landen in `gameoflife-data/library.json`:

| Variante | Ort |
|---|---|
| Windows `.exe` | neben der `.exe` |
| AppImage | neben der `.AppImage`-Datei |
| Fallback (Ordner nicht beschreibbar) | App-Datenverzeichnis des Systems |

Den Pfad zeigt die App unter **Welt → Speicherort**. Zum Weitergeben einfach die `.exe`/`.AppImage` zusammen mit dem Ordner kopieren.

In der **Web-Version** liegt die Bibliothek im `localStorage` des Browsers. Unter **Welt → Bibliothek exportieren/importieren** lässt sie sich als JSON-Datei sichern und zwischen Web und Desktop austauschen.

## Web-Version auf GitHub Pages

1. Projekt in ein GitHub-Repo pushen (inkl. `Cargo.lock` und `package-lock.json`).
2. Im Repo: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Jeder Push auf `main` baut über `.github/workflows/pages.yml` die WASM-Engine und das Frontend und veröffentlicht beides unter `https://<user>.github.io/<repo>/`.

Lokal testen:

```bash
npm run dev:web        # baut WASM, startet Vite unter http://localhost:1420
npm run build:web      # statischer Build nach ./dist (relativer Pfad, läuft in jedem Unterordner)
```

`build:wasm` installiert bei Bedarf `wasm-bindgen-cli` in der Version, die in `Cargo.lock` steht, und legt die Bindings in `src/wasm/pkg/` ab (nicht eingecheckt).

| | Desktop | Web |
|---|---|---|
| Engine | Rust nativ, mehrkernig (rayon) | Rust → WebAssembly, ein Kern |
| Bibliothek | `gameoflife-data/library.json` | `localStorage` + JSON-Export |
| Dateien | nativer Dialog | Upload / Download |

## Bauen (Ubuntu)

```bash
bash scripts/setup-ubuntu.sh             # einmalig: Systempakete, Rust, npm install
bash scripts/setup-ubuntu.sh --windows   # optional: Cross-Build für Windows

npm run app            # Entwicklungsmodus mit Hot Reload
npm run test:engine    # Unit-Tests der Simulation
npm run release        # AppImage (+ Windows-ZIP) nach ./release
```

Einzelne Ziele:

```bash
npm run build:linux            # -> target/release/bundle/appimage/*.AppImage
npm run build:windows          # Cross-Compile mit cargo-xwin -> target/x86_64-pc-windows-msvc/release/spiel-des-lebens.exe
npm run build:windows-native   # direkt auf Windows -> target/release/spiel-des-lebens.exe
```

> Der Windows-Cross-Build von Linux aus wird von Tauri als „experimentell“ bezeichnet. Wenn er Probleme macht: auf einem Windows-Rechner mit Rust, Node und den MSVC Build Tools `npm install && npm run build:windows-native` ausführen.
> Die `.exe` braucht die WebView2-Runtime, die bei Windows 10/11 vorinstalliert ist.

## Projektstruktur

```
engine/              Rust-Crate ohne Tauri-Abhängigkeit (separat testbar, Feature `parallel`)
  src/rule.rs          Regelmodell, Parser/Formatter aller Notationen
  src/universe.rs      Gitter + Schritt (Zeilen-Präfixsummen, parallel mit rayon)
  src/rle.rs           RLE lesen/schreiben (auch Mehrzustand)
  src/presets.rs       Regel- und Mustervorlagen
engine-wasm/         wasm-bindgen-Schnittstelle der Engine für den Browser
src-tauri/           Tauri-App
  src/commands.rs      IPC-Befehle (Frames als Binärdaten, nicht JSON)
  src/storage.rs       portable Bibliothek (atomar gespeichert)
src/                 React-Frontend
  components/          LifeCanvas, RuleEditor, PatternPanel, WorldPanel, StatsBar
  hooks/useSimulation  Taktgeber (ein step-Aufruf gleichzeitig, Zeitbudget 40 ms)
  lib/backend/         Backend-Schnittstelle: tauri.ts (Desktop) und web.ts (WASM)
  lib/                 API-Auswahl, Regel-Helfer, Farbpalette
  wasm/                Typen + Platzhalter für die WASM-Engine
scripts/             Setup, Release, WASM-Build
.github/workflows/   GitHub-Pages-Deployment
```

## Regel-Notation

| Schreibweise | Bedeutung |
|---|---|
| `B36/S23` | Geburt bei 3 oder 6, Überleben bei 2 oder 3 Nachbarn |
| `23/36` | dasselbe in S/B-Reihenfolge |
| `B2/S/C3` bzw. `/2/3` | Generations mit 3 Zuständen (lebend, sterbend, tot) |
| `B2/S34H` | hexagonale Nachbarschaft (6 Nachbarn) |
| `B1/S1V` | Von-Neumann-Nachbarschaft (4 Nachbarn) |
| `R5,C0,M1,S34..58,B34..45,NM` | LtL/HROT: Radius 5, 2 Zustände, Zentrum zählt mit, Moore |
| `R2,C3,S2-3,8,B3,NN` | HROT mit Listen, 3 Zustände, Von Neumann |

`C0` und `C2` bedeuten beide 2 Zustände. `N` steht für die Nachbarschaft: `M` = Moore, `N` = Von Neumann, `H` = Hex.
Bei der Hex-Darstellung ist jede Zeile um eine halbe Zelle versetzt (axiale Koordinaten), so wie in Golly.
