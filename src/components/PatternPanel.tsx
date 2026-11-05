import { useMemo, useState } from "react";
import { api, errorText } from "../lib/api";
import type { Library, Presets } from "../lib/types";

interface Props {
  presets: Presets;
  library: Library;
  onStartPlacement: (rle: string, fallbackName: string) => Promise<void>;
  onSavePattern: (name: string, rle: string) => void;
  onDeletePattern: (name: string) => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
}

export function PatternPanel({
  presets,
  library,
  onStartPlacement,
  onSavePattern,
  onDeletePattern,
  onError,
  onInfo,
}: Props) {
  const [rle, setRle] = useState("");
  const [name, setName] = useState("");

  const grouped = useMemo(() => {
    const m = new Map<string, typeof presets.patterns>();
    for (const p of presets.patterns) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [presets]);

  const exportWorld = async () => {
    try {
      setRle(await api.exportRle());
    } catch (e) {
      onError(errorText(e));
    }
  };

  const openFile = async () => {
    try {
      const file = await api.openTextFile("rle");
      if (!file) return;
      setRle(file.text);
      await onStartPlacement(file.text, file.name.replace(/\.[^.]+$/, "") || "Datei");
    } catch (e) {
      onError(errorText(e));
    }
  };

  const saveFile = async () => {
    try {
      const content = rle.trim() ? rle : await api.exportRle();
      const where = await api.saveTextFile("rle", "muster.rle", content);
      if (where) onInfo(`Gespeichert: ${where}`);
    } catch (e) {
      onError(errorText(e));
    }
  };

  return (
    <div className="panel-body">
      <p className="hint">Muster wählen, dann ins Feld klicken (mehrfach möglich). Esc beendet das Platzieren.</p>
      {grouped.map(([cat, items]) => (
        <section key={cat}>
          <label className="label">{cat}</label>
          <div className="pattern-grid">
            {items.map((p) => (
              <button key={p.name} className="pattern-btn" title={p.description} onClick={() => onStartPlacement(p.rle, p.name)}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      ))}

      {library.patterns.length > 0 && (
        <section>
          <label className="label">Eigene Muster</label>
          <ul className="item-list">
            {library.patterns.map((p) => (
              <li key={p.name}>
                <button className="link" onClick={() => onStartPlacement(p.rle, p.name)}>
                  <span>★ {p.name}</span>
                </button>
                <button className="icon" title="Löschen" onClick={() => onDeletePattern(p.name)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <label className="label">RLE</label>
        <textarea
          className="mono"
          rows={7}
          spellCheck={false}
          placeholder={"x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!"}
          value={rle}
          onChange={(e) => setRle(e.target.value)}
        />
        <div className="btn-row">
          <button className="primary" disabled={!rle.trim()} onClick={() => onStartPlacement(rle, "RLE")}>
            Platzieren
          </button>
          <button onClick={exportWorld}>Welt → RLE</button>
        </div>
        <div className="btn-row">
          <button onClick={openFile}>Datei öffnen …</button>
          <button onClick={saveFile}>Speichern unter …</button>
        </div>
      </section>

      <section className="save-box">
        <label className="label">RLE in Bibliothek ablegen</label>
        <div className="row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="primary"
            disabled={!name.trim() || !rle.trim()}
            onClick={() => {
              onSavePattern(name, rle);
              setName("");
            }}
          >
            Ablegen
          </button>
        </div>
      </section>
    </div>
  );
}
