import { useEffect, useMemo, useState } from "react";
import {
  MAX_RADIUS,
  MAX_STATES,
  NEIGHBORHOOD_LABEL,
  family,
  formatCounts,
  inNeighborhood,
  maxCount,
  parseCounts,
} from "../lib/rules";
import type { Library, Neighborhood, Presets, Rule, RuleInfo } from "../lib/types";

interface Props {
  info: RuleInfo;
  presets: Presets;
  library: Library;
  onApply: (rule: Rule) => void;
  onApplyString: (text: string) => Promise<boolean>;
  onSave: (name: string, rule: string, description: string) => void;
  onDelete: (name: string) => void;
}

export function RuleEditor({ info, presets, library, onApply, onApplyString, onSave, onDelete }: Props) {
  const { rule } = info;
  const [text, setText] = useState(info.canonical);
  const [textError, setTextError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  useEffect(() => {
    setText(info.canonical);
    setTextError(null);
  }, [info.canonical]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof presets.rules>();
    for (const p of presets.rules) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()];
  }, [presets]);

  const current =
    presets.rules.find((p) => p.rule === info.canonical || p.rule.replace(/\.\./g, "-") === info.canonical) ??
    library.rules.find((r) => r.rule === info.canonical);

  const update = (patch: Partial<Rule>) => onApply({ ...rule, ...patch });
  const max = maxCount(rule);

  const submitText = async () => {
    if (text.trim() === info.canonical) return;
    const ok = await onApplyString(text);
    setTextError(ok ? null : "Regel konnte nicht gelesen werden");
  };

  return (
    <div className="panel-body">
      <section>
        <label className="label">Vorlage</label>
        <select
          value={current ? current.rule : ""}
          onChange={(e) => e.target.value && onApplyString(e.target.value)}
        >
          {!current && <option value="">— eigene Einstellung —</option>}
          {grouped.map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((p) => (
                <option key={p.name} value={p.rule}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
          {library.rules.length > 0 && (
            <optgroup label="Eigene Regeln">
              {library.rules.map((r) => (
                <option key={"u-" + r.name} value={r.rule}>
                  ★ {r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {current && <p className="hint">{current.description}</p>}
      </section>

      <section>
        <label className="label">
          Regel-String <span className="badge">{family(rule)}</span>
        </label>
        <div className="row">
          <input
            className={"mono" + (textError ? " invalid" : "")}
            value={text}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitText()}
            onBlur={submitText}
          />
        </div>
        {textError ? (
          <p className="hint error">{textError}</p>
        ) : (
          <p className="hint">B3/S23 · 23/3 · B2/S/C3 · B2/S34H · R5,C0,M1,S34..58,B34..45,NM</p>
        )}
      </section>

      <section>
        <label className="label">Nachbarschaft</label>
        <div className="segmented">
          {(["moore", "vonNeumann", "hex"] as Neighborhood[]).map((nb) => (
            <button
              key={nb}
              className={rule.neighborhood === nb ? "active" : ""}
              onClick={() => update({ neighborhood: nb })}
            >
              {NEIGHBORHOOD_LABEL[nb]}
            </button>
          ))}
        </div>
        <div className="nb-row">
          <NeighborhoodPreview rule={rule} />
          <div className="nb-controls">
            <label className="mini">
              Radius <b>{rule.radius}</b>
              <input
                type="range"
                min={1}
                max={MAX_RADIUS}
                value={rule.radius}
                onChange={(e) => update({ radius: Number(e.target.value) })}
              />
            </label>
            <label className="mini">
              Zustände
              <input
                type="number"
                min={2}
                max={MAX_STATES}
                value={rule.states}
                onChange={(e) => {
                  const v = Math.max(2, Math.min(MAX_STATES, Number(e.target.value) || 2));
                  update({ states: v });
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.includeCenter}
                onChange={(e) => update({ includeCenter: e.target.checked })}
              />
              Zentrum mitzählen
            </label>
            <p className="hint">{max} mögliche Nachbarn</p>
          </div>
        </div>
      </section>

      <CountPicker
        label="Geburt (B)"
        hint="Tote Zelle wird lebendig bei …"
        values={rule.birth}
        max={max}
        onChange={(birth) => update({ birth })}
      />
      <CountPicker
        label="Überleben (S)"
        hint="Lebende Zelle bleibt bei …"
        values={rule.survival}
        max={max}
        onChange={(survival) => update({ survival })}
      />
      {rule.states > 2 && (
        <p className="hint">
          Generations: Zellen, die nicht überleben, verglimmen über {rule.states - 2} Zwischenzustand
          {rule.states - 2 === 1 ? "" : "e"} und zählen dabei nicht als Nachbarn.
        </p>
      )}

      <section className="save-box">
        <label className="label">Als eigene Regel speichern</label>
        <input placeholder="Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
        <input
          placeholder="Beschreibung (optional)"
          value={saveDesc}
          onChange={(e) => setSaveDesc(e.target.value)}
        />
        <button
          className="primary"
          disabled={!saveName.trim()}
          onClick={() => {
            onSave(saveName, info.canonical, saveDesc);
            setSaveName("");
            setSaveDesc("");
          }}
        >
          Speichern
        </button>
        {library.rules.length > 0 && (
          <ul className="item-list">
            {library.rules.map((r) => (
              <li key={r.name}>
                <button className="link" onClick={() => onApplyString(r.rule)} title={r.description}>
                  <span>★ {r.name}</span>
                  <code>{r.rule}</code>
                </button>
                <button className="icon" title="Löschen" onClick={() => onDelete(r.name)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CountPicker({
  label,
  hint,
  values,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  values: number[];
  max: number;
  onChange: (v: number[]) => void;
}) {
  const formatted = formatCounts(values);
  const [text, setText] = useState(formatted);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(formatted);
    setError(null);
  }, [formatted]);

  const set = new Set(values);
  const toggle = (n: number) => {
    const next = new Set(set);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange([...next].sort((a, b) => a - b));
  };
  const commit = () => {
    try {
      const v = parseCounts(text, max);
      setError(null);
      if (formatCounts(v) !== formatted) onChange(v);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section>
      <label className="label">
        {label} <span className="hint-inline">{hint}</span>
      </label>
      {max <= 48 && (
        <div className="chips">
          {Array.from({ length: max + 1 }, (_, n) => (
            <button key={n} className={set.has(n) ? "chip on" : "chip"} onClick={() => toggle(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <input
        className={"mono" + (error ? " invalid" : "")}
        value={text}
        placeholder="z. B. 2-3,8 (leer = keine)"
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={commit}
      />
      {error && <p className="hint error">{error}</p>}
    </section>
  );
}

function NeighborhoodPreview({ rule }: { rule: Rule }) {
  const r = rule.radius;
  const n = 2 * r + 1;
  const size = 132;
  const cell = size / (n + (rule.neighborhood === "hex" ? n / 2 : 0));
  const skew = rule.neighborhood === "hex" ? -0.5 : 0;
  const offsetX = rule.neighborhood === "hex" ? (n * cell) / 2 : 0;
  const rects = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const inside = inNeighborhood(rule.neighborhood, r, dx, dy);
      const center = dx === 0 && dy === 0;
      const x = (dx + r) * cell + skew * (dy + r) * cell + offsetX;
      const y = (dy + r) * cell;
      rects.push(
        <rect
          key={`${dx},${dy}`}
          x={x + 0.5}
          y={y + 0.5}
          width={Math.max(1, cell - 1)}
          height={Math.max(1, cell - 1)}
          rx={cell > 8 ? 2 : 0}
          className={center ? (rule.includeCenter ? "nb-center counted" : "nb-center") : inside ? "nb-on" : "nb-off"}
        />,
      );
    }
  }
  return (
    <svg className="nb-preview" width={size} height={n * cell} viewBox={`0 0 ${size} ${n * cell}`}>
      {rects}
    </svg>
  );
}
