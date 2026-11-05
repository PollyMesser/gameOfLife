import init, * as wasm from "life-engine-wasm";
import { decodeFrame } from "../frame";
import type { Cell, Library, Pattern, Presets, RuleInfo, SavedPattern, SavedRule } from "../types";
import type { Backend, FileKind, OpenedFile } from "./types";

/** Zeitbudget pro step-Aufruf wie auf dem Desktop. */
const STEP_BUDGET_MS = 40;
const LIBRARY_KEY = "gol.library";

const seed = () => Math.floor(Math.random() * 2 ** 52);

// ---------- Bibliothek im Browser (localStorage) ----------

interface StoredLibrary {
  rules: SavedRule[];
  patterns: SavedPattern[];
}

function loadLibrary(): StoredLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<StoredLibrary>;
      return { rules: data.rules ?? [], patterns: data.patterns ?? [] };
    }
  } catch {
    /* gesperrter Speicher oder kaputtes JSON -> leer */
  }
  return { rules: [], patterns: [] };
}

function storeLibrary(lib: StoredLibrary): Library {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    throw "Browser-Speicher nicht verfügbar – bitte die Bibliothek als Datei exportieren.";
  }
  return toLibrary(lib);
}

const toLibrary = (lib: StoredLibrary): Library => ({
  ...lib,
  dataDir: "Browser (localStorage)",
});

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

// ---------- Dateien ----------

const ACCEPT: Record<FileKind, string> = {
  rle: ".rle,.txt,.lif",
  json: ".json,application/json",
};

function pickFile(kind: FileKind): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT[kind];
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 50 * 1024 * 1024) return reject("Datei ist größer als 50 MB");
      file.text().then((text) => resolve({ name: file.name, text }), reject);
    });
    input.click();
  });
}

function download(name: string, content: string, kind: FileKind) {
  const type = kind === "json" ? "application/json" : "text/plain";
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Backend ----------

export async function createWebBackend(): Promise<Backend> {
  await init();
  const sim = new wasm.WebSim(256, 192, true, seed());
  const frame = () => decodeFrame(sim.frame());
  const wrapErr = <T>(fn: () => T): Promise<T> => {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e);
    }
  };

  return {
    platform: "web",

    getFrame: async () => frame(),
    step: async (count) => {
      // in wachsenden Paketen rechnen, bis count erreicht oder das Zeitbudget aufgebraucht ist
      const start = performance.now();
      let done = 0;
      let chunk = 1;
      const target = Math.max(1, Math.min(count, 1000));
      while (done < target) {
        const n = Math.min(chunk, target - done);
        sim.advance(n);
        done += n;
        if (performance.now() - start > STEP_BUDGET_MS) break;
        chunk *= 2;
      }
      return frame();
    },
    newUniverse: async (w, h, wrap) => (sim.newUniverse(w, h, wrap), frame()),
    resize: async (w, h) => (sim.resize(w, h), frame()),
    setWrap: async (wrap) => sim.setWrap(wrap),
    clear: async () => (sim.clear(), frame()),
    randomize: async (density) => (sim.randomize(density, seed()), frame()),
    setCells: async (cells: Cell[]) => {
      sim.setCells(Int32Array.from(cells.flat()));
      return frame();
    },

    getRule: () => wrapErr(() => sim.getRule() as RuleInfo),
    parseRule: (text) => wrapErr(() => wasm.parseRule(text) as RuleInfo),
    applyRule: (rule) => wrapErr(() => sim.applyRule(rule) as RuleInfo),
    applyRuleString: (text) => wrapErr(() => sim.applyRuleString(text) as RuleInfo),

    parsePattern: (text) => wrapErr(() => wasm.parsePattern(text) as Pattern),
    exportRle: async () => sim.exportRle(),
    listPresets: () => wrapErr(() => wasm.presets() as Presets),

    getLibrary: async () => toLibrary(loadLibrary()),
    saveRule: (name, rule, description) =>
      wrapErr(() => {
        const n = name.trim();
        if (!n) throw "Bitte einen Namen angeben";
        const canonical = (wasm.parseRule(rule) as RuleInfo).canonical;
        const lib = loadLibrary();
        lib.rules = [...lib.rules.filter((r) => r.name !== n), { name: n, rule: canonical, description }].sort(byName);
        return storeLibrary(lib);
      }),
    deleteRule: (name) =>
      wrapErr(() => {
        const lib = loadLibrary();
        lib.rules = lib.rules.filter((r) => r.name !== name);
        return storeLibrary(lib);
      }),
    savePattern: (name, rle) =>
      wrapErr(() => {
        const n = name.trim();
        if (!n) throw "Bitte einen Namen angeben";
        wasm.parsePattern(rle); // validiert
        const lib = loadLibrary();
        lib.patterns = [...lib.patterns.filter((p) => p.name !== n), { name: n, rle }].sort(byName);
        return storeLibrary(lib);
      }),
    deletePattern: (name) =>
      wrapErr(() => {
        const lib = loadLibrary();
        lib.patterns = lib.patterns.filter((p) => p.name !== name);
        return storeLibrary(lib);
      }),

    openTextFile: (kind) => pickFile(kind),
    saveTextFile: async (kind, defaultName, content) => {
      download(defaultName, content, kind);
      return `Downloads/${defaultName}`;
    },
  };
}
