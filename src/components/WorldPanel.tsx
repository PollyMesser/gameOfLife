import { useEffect, useState } from "react";
import type { Colors, Frame } from "../lib/types";

interface Props {
  frame: Frame | null;
  wrap: boolean;
  density: number;
  colors: Colors;
  showGrid: boolean;
  dataDir: string;
  platform: "desktop" | "web";
  onExportLibrary: () => void;
  onImportLibrary: () => void;
  onNew: (w: number, h: number) => void;
  onResize: (w: number, h: number) => void;
  onWrap: (wrap: boolean) => void;
  onDensity: (d: number) => void;
  onRandom: () => void;
  onColors: (c: Colors) => void;
  onShowGrid: (v: boolean) => void;
}

const SIZES: [string, number, number][] = [
  ["Klein", 96, 64],
  ["Mittel", 256, 192],
  ["Groß", 512, 384],
  ["Riesig", 1024, 768],
];

export function WorldPanel(p: Props) {
  const [w, setW] = useState(p.frame?.width ?? 256);
  const [h, setH] = useState(p.frame?.height ?? 192);
  useEffect(() => {
    if (p.frame) {
      setW(p.frame.width);
      setH(p.frame.height);
    }
  }, [p.frame?.width, p.frame?.height]);

  const clampSize = (v: number) => Math.max(32, Math.min(4096, Math.round(v) || 32));

  return (
    <div className="panel-body">
      <section>
        <label className="label">Größe</label>
        <div className="pattern-grid">
          {SIZES.map(([name, sw, sh]) => (
            <button key={name} className="pattern-btn" onClick={() => p.onNew(sw, sh)}>
              {name} <span className="dim">{sw}×{sh}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <input type="number" min={32} max={4096} value={w} onChange={(e) => setW(Number(e.target.value))} />
          <span className="dim">×</span>
          <input type="number" min={32} max={4096} value={h} onChange={(e) => setH(Number(e.target.value))} />
        </div>
        <div className="btn-row">
          <button onClick={() => p.onNew(clampSize(w), clampSize(h))}>Neu (leer)</button>
          <button onClick={() => p.onResize(clampSize(w), clampSize(h))}>Größe ändern</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={p.wrap} onChange={(e) => p.onWrap(e.target.checked)} />
          Torus – Ränder sind verbunden
        </label>
      </section>

      <section>
        <label className="label">
          Zufallsfüllung <b>{Math.round(p.density * 100)} %</b>
        </label>
        <input
          type="range"
          min={1}
          max={90}
          value={Math.round(p.density * 100)}
          onChange={(e) => p.onDensity(Number(e.target.value) / 100)}
        />
        <button onClick={p.onRandom}>Zufällig füllen</button>
      </section>

      <section>
        <label className="label">Darstellung</label>
        <label className="check">
          <input type="checkbox" checked={p.showGrid} onChange={(e) => p.onShowGrid(e.target.checked)} />
          Gitterlinien (ab Zoom 6×)
        </label>
        <div className="color-row">
          <ColorInput label="Lebend" value={p.colors.alive} onChange={(alive) => p.onColors({ ...p.colors, alive })} />
          <ColorInput label="Sterbend" value={p.colors.dying} onChange={(dying) => p.onColors({ ...p.colors, dying })} />
          <ColorInput
            label="Hintergrund"
            value={p.colors.background}
            onChange={(background) => p.onColors({ ...p.colors, background })}
          />
        </div>
      </section>

      <section>
        <label className="label">Tastenkürzel</label>
        <dl className="keys">
          <dt>Leertaste</dt><dd>Start / Pause</dd>
          <dt>N oder →</dt><dd>Ein Schritt</dd>
          <dt>R</dt><dd>Zufällig füllen</dd>
          <dt>C</dt><dd>Leeren</dd>
          <dt>F</dt><dd>Ansicht einpassen</dd>
          <dt>G</dt><dd>Gitterlinien</dd>
          <dt>Esc</dt><dd>Platzieren beenden</dd>
          <dt>Mausrad</dt><dd>Zoom</dd>
          <dt>Shift + Ziehen</dt><dd>Verschieben</dd>
        </dl>
      </section>

      <section>
        <label className="label">{p.platform === "web" ? "Speicherort (Browser)" : "Speicherort (portabel)"}</label>
        <code className="path">{p.dataDir || "–"}</code>
        <p className="hint">
          {p.platform === "web"
            ? "Eigene Regeln und Muster bleiben nur in diesem Browser. Zum Sichern oder Übertragen exportieren."
            : "Eigene Regeln und Muster liegen in library.json – einfach mitkopieren."}
        </p>
        <div className="btn-row">
          <button onClick={p.onExportLibrary}>Bibliothek exportieren</button>
          <button onClick={p.onImportLibrary}>Importieren …</button>
        </div>
      </section>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>{label}</span>
    </label>
  );
}
