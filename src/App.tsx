import { useCallback, useEffect, useRef, useState } from "react";
import { LifeCanvas, type LifeCanvasHandle } from "./components/LifeCanvas";
import { PatternPanel } from "./components/PatternPanel";
import { RuleEditor } from "./components/RuleEditor";
import { StatsBar, type Sample } from "./components/StatsBar";
import { WorldPanel } from "./components/WorldPanel";
import { useSimulation } from "./hooks/useSimulation";
import { api, errorText } from "./lib/api";
import { DEFAULT_COLORS } from "./lib/palette";
import type { Cell, Colors, Frame, Library, Placement, Presets, Rule, RuleInfo } from "./lib/types";

const SPEEDS = [1, 2, 5, 10, 20, 30, 60, 120, 250, 500, 1000, 0]; // 0 = Maximum
const HISTORY_LEN = 600;
type Tab = "rule" | "patterns" | "world";

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem("gol." + key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function storeSetting(key: string, value: unknown) {
  try {
    localStorage.setItem("gol." + key, JSON.stringify(value));
  } catch {
    /* egal */
  }
}

export default function App() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [ruleInfo, setRuleInfo] = useState<RuleInfo | null>(null);
  const [presets, setPresets] = useState<Presets>({ rules: [], patterns: [] });
  const [library, setLibrary] = useState<Library>({ rules: [], patterns: [], dataDir: "" });
  const [running, setRunning] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(() => loadSetting("speedIdx", 6));
  const [tab, setTab] = useState<Tab>("rule");
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [wrap, setWrap] = useState(true);
  const [density, setDensity] = useState(() => loadSetting("density", 0.25));
  const [colors, setColors] = useState<Colors>(() => loadSetting("colors", DEFAULT_COLORS));
  const [showGrid, setShowGrid] = useState(() => loadSetting("showGrid", true));
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [gensPerSec, setGensPerSec] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const canvasRef = useRef<LifeCanvasHandle>(null);
  const runningRef = useRef(false);
  runningRef.current = running;
  const history = useRef<Sample[]>([]);
  const rate = useRef<{ t: number; gen: number }[]>([]);

  useEffect(() => storeSetting("speedIdx", speedIdx), [speedIdx]);
  useEffect(() => storeSetting("density", density), [density]);
  useEffect(() => storeSetting("colors", colors), [colors]);
  useEffect(() => storeSetting("showGrid", showGrid), [showGrid]);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 5000 : 2500);
  }, []);
  const fail = useCallback((e: unknown) => notify(errorText(e), true), [notify]);

  /** Zentrale Stelle fuer neue Frames: Statistik + Verlauf pflegen. */
  const acceptFrame = useCallback((f: Frame) => {
    const h = history.current;
    const last = h[h.length - 1];
    if (!last || f.generation < last.gen) {
      history.current = [{ gen: f.generation, pop: f.population }];
      rate.current = [];
    } else if (f.generation > last.gen) {
      h.push({ gen: f.generation, pop: f.population });
      if (h.length > HISTORY_LEN) h.splice(0, h.length - HISTORY_LEN);
    } else {
      h[h.length - 1] = { gen: f.generation, pop: f.population };
    }
    const now = performance.now();
    const r = rate.current;
    r.push({ t: now, gen: f.generation });
    while (r.length > 2 && now - r[0].t > 1000) r.shift();
    if (runningRef.current && r.length > 1 && r[r.length - 1].t > r[0].t) {
      setGensPerSec(((r[r.length - 1].gen - r[0].gen) * 1000) / (r[r.length - 1].t - r[0].t));
    }
    setHistoryVersion((v) => v + 1);
    setFrame(f);
  }, []);

  const run = useCallback(
    async (p: Promise<Frame>) => {
      try {
        acceptFrame(await p);
      } catch (e) {
        fail(e);
      }
    },
    [acceptFrame, fail],
  );

  // Startzustand laden
  useEffect(() => {
    Promise.all([api.getFrame(), api.getRule(), api.listPresets(), api.getLibrary()])
      .then(([f, r, p, l]) => {
        acceptFrame(f);
        setRuleInfo(r);
        setPresets(p);
        setLibrary(l);
      })
      .catch(fail);
  }, [acceptFrame, fail]);

  useSimulation(running, SPEEDS[speedIdx], acceptFrame, (e) => {
    setRunning(false);
    fail(e);
  });

  useEffect(() => {
    rate.current = [];
    if (!running) setGensPerSec(0);
  }, [running]);

  // ---------- Aktionen ----------
  const step = () => run(api.step(1));
  const clear = () => run(api.clear());
  const randomize = () => run(api.randomize(density));

  const applyRule = async (rule: Rule) => {
    try {
      setRuleInfo(await api.applyRule(rule));
      if (rule.states < (ruleInfo?.rule.states ?? 2)) run(api.getFrame());
    } catch (e) {
      fail(e);
    }
  };
  const applyRuleString = async (text: string): Promise<boolean> => {
    try {
      const info = await api.applyRuleString(text);
      setRuleInfo(info);
      run(api.getFrame());
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const startPlacement = async (rle: string, fallbackName: string) => {
    try {
      const p = await api.parsePattern(rle);
      if (!p.cells.length) return notify("Muster ist leer", true);
      setPlacement({ name: p.name ?? fallbackName, width: p.width, height: p.height, cells: p.cells, rule: p.rule });
    } catch (e) {
      fail(e);
    }
  };

  const place = (x: number, y: number) => {
    if (!placement) return;
    const cells: Cell[] = placement.cells.map(([cx, cy, s]) => [cx + x, cy + y, s]);
    run(api.setCells(cells));
  };

  const transformPlacement = (kind: "rotate" | "flip") =>
    setPlacement((p) => {
      if (!p) return p;
      if (kind === "rotate") {
        return {
          ...p,
          width: p.height,
          height: p.width,
          cells: p.cells.map(([x, y, s]) => [p.height - 1 - y, x, s] as Cell),
        };
      }
      return { ...p, cells: p.cells.map(([x, y, s]) => [p.width - 1 - x, y, s] as Cell) };
    });

  const [placementRuleCanonical, setPlacementRuleCanonical] = useState<string | null>(null);
  useEffect(() => {
    setPlacementRuleCanonical(null);
    if (!placement?.rule) return;
    api
      .parseRule(placement.rule)
      .then((i) => setPlacementRuleCanonical(i.canonical))
      .catch(() => setPlacementRuleCanonical(null));
  }, [placement?.rule]);

  const exportLibrary = async () => {
    try {
      const { rules, patterns } = await api.getLibrary();
      const json = JSON.stringify({ format: "spiel-des-lebens-bibliothek", version: 1, rules, patterns }, null, 2);
      const where = await api.saveTextFile("json", "spiel-des-lebens-bibliothek.json", json);
      if (where) notify(`Exportiert: ${where}`);
    } catch (e) {
      fail(e);
    }
  };

  const importLibrary = async () => {
    try {
      const file = await api.openTextFile("json");
      if (!file) return;
      const data = JSON.parse(file.text) as Partial<Pick<Library, "rules" | "patterns">>;
      if (!Array.isArray(data.rules) && !Array.isArray(data.patterns)) throw "Keine gültige Bibliotheksdatei";
      let lib: Library | null = null;
      let count = 0;
      for (const r of data.rules ?? []) {
        lib = await api.saveRule(r.name, r.rule, r.description ?? "");
        count++;
      }
      for (const pt of data.patterns ?? []) {
        lib = await api.savePattern(pt.name, pt.rle);
        count++;
      }
      if (lib) setLibrary(lib);
      notify(`${count} ${count === 1 ? "Eintrag" : "Einträge"} importiert`);
    } catch (e) {
      fail(e instanceof SyntaxError ? "Datei ist kein gültiges JSON" : e);
    }
  };

  const libraryAction = async (p: Promise<Library>, msg: string) => {
    try {
      setLibrary(await p);
      notify(msg);
    } catch (e) {
      fail(e);
    }
  };

  // ---------- Tastatur ----------
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        setRunning((r) => !r);
        break;
      case "n":
      case "N":
      case "ArrowRight":
        if (!running) step();
        break;
      case "r":
      case "R":
        randomize();
        break;
      case "c":
      case "C":
        clear();
        break;
      case "f":
      case "F":
        canvasRef.current?.fit();
        break;
      case "g":
      case "G":
        setShowGrid((g) => !g);
        break;
      case "Escape":
        setPlacement(null);
        break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const speed = SPEEDS[speedIdx];
  const rule = ruleInfo?.rule;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <Logo />
          <div>
            <h1>Spiel des Lebens</h1>
            <span className="sub">Regel-Labor{api.platform === "web" ? " · Web" : ""}</span>
          </div>
        </div>

        <div className="controls">
          <button className={"play" + (running ? " running" : "")} onClick={() => setRunning((r) => !r)} title="Leertaste">
            {running ? "❚❚ Pause" : "▶ Start"}
          </button>
          <button onClick={step} disabled={running} title="N">
            Schritt
          </button>
          <button onClick={randomize} title="R">
            Zufall
          </button>
          <button onClick={clear} title="C">
            Leeren
          </button>
          <button onClick={() => canvasRef.current?.fit()} title="F">
            Einpassen
          </button>
        </div>

        <label className="speed">
          <span>Tempo</span>
          <input type="range" min={0} max={SPEEDS.length - 1} value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))} />
          <b className="mono">{speed === 0 ? "max" : `${speed}/s`}</b>
        </label>
      </header>

      <main className="main">
        <div className="stage">
          {placement && (
            <div className="placement-bar">
              <span>
                Platziere <b>{placement.name}</b> <span className="dim">({placement.width}×{placement.height})</span>
              </span>
              <button onClick={() => transformPlacement("rotate")}>⟳ Drehen</button>
              <button onClick={() => transformPlacement("flip")}>⇋ Spiegeln</button>
              {placementRuleCanonical && ruleInfo && placementRuleCanonical !== ruleInfo.canonical && (
                <button className="accent" onClick={() => applyRuleString(placementRuleCanonical)}>
                  Regel {placementRuleCanonical} übernehmen
                </button>
              )}
              <button onClick={() => setPlacement(null)}>Fertig (Esc)</button>
            </div>
          )}
          <LifeCanvas
            ref={canvasRef}
            frame={frame}
            hex={rule?.neighborhood === "hex"}
            states={rule?.states ?? 2}
            colors={colors}
            showGrid={showGrid}
            placement={placement}
            onPaint={(cells) => run(api.setCells(cells))}
            onPlace={place}
          />
          <StatsBar
            frame={frame}
            history={history.current}
            version={historyVersion}
            gensPerSec={gensPerSec}
            rule={ruleInfo?.canonical ?? "–"}
            color={colors.alive}
          />
        </div>

        <aside className="sidebar">
          <nav className="tabs">
            <button className={tab === "rule" ? "active" : ""} onClick={() => setTab("rule")}>
              Regel
            </button>
            <button className={tab === "patterns" ? "active" : ""} onClick={() => setTab("patterns")}>
              Muster
            </button>
            <button className={tab === "world" ? "active" : ""} onClick={() => setTab("world")}>
              Welt
            </button>
          </nav>
          <div className="tab-content">
            {tab === "rule" && ruleInfo && (
              <RuleEditor
                info={ruleInfo}
                presets={presets}
                library={library}
                onApply={applyRule}
                onApplyString={applyRuleString}
                onSave={(n, r, d) => libraryAction(api.saveRule(n, r, d), `Regel „${n}“ gespeichert`)}
                onDelete={(n) => libraryAction(api.deleteRule(n), `Regel „${n}“ gelöscht`)}
              />
            )}
            {tab === "patterns" && (
              <PatternPanel
                presets={presets}
                library={library}
                onStartPlacement={startPlacement}
                onSavePattern={(n, rle) => libraryAction(api.savePattern(n, rle), `Muster „${n}“ abgelegt`)}
                onDeletePattern={(n) => libraryAction(api.deletePattern(n), `Muster „${n}“ gelöscht`)}
                onError={(m) => notify(m, true)}
                onInfo={(m) => notify(m)}
              />
            )}
            {tab === "world" && (
              <WorldPanel
                frame={frame}
                wrap={wrap}
                density={density}
                colors={colors}
                showGrid={showGrid}
                dataDir={library.dataDir}
                platform={api.platform}
                onExportLibrary={exportLibrary}
                onImportLibrary={importLibrary}
                onNew={(w, h) => run(api.newUniverse(w, h, wrap))}
                onResize={(w, h) => run(api.resize(w, h))}
                onWrap={(v) => {
                  setWrap(v);
                  api.setWrap(v).catch(fail);
                }}
                onDensity={setDensity}
                onRandom={randomize}
                onColors={setColors}
                onShowGrid={setShowGrid}
              />
            )}
          </div>
        </aside>
      </main>

      {toast && <div className={"toast" + (toast.error ? " error" : "")}>{toast.text}</div>}
    </div>
  );
}

function Logo() {
  // Gleiter
  const on = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  return (
    <svg className="logo" viewBox="0 0 3 3" width="26" height="26">
      {on.map(([x, y]) => (
        <rect key={`${x}${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.15} />
      ))}
    </svg>
  );
}
