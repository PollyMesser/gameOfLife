import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { decodeFrame } from "../frame";
import type { Library, Pattern, Presets, RuleInfo } from "../types";
import type { Backend, FileKind } from "./types";

const FILTERS: Record<FileKind, { name: string; extensions: string[] }[]> = {
  rle: [{ name: "RLE-Muster", extensions: ["rle", "txt", "lif"] }],
  json: [{ name: "Bibliothek (JSON)", extensions: ["json"] }],
};

const frame = async (cmd: string, args?: Record<string, unknown>) => decodeFrame(await invoke(cmd, args));

export function createTauriBackend(): Backend {
  return {
    platform: "desktop",

    getFrame: () => frame("get_frame"),
    step: (count) => frame("step", { count }),
    newUniverse: (width, height, wrap) => frame("new_universe", { width, height, wrap }),
    resize: (width, height) => frame("resize_universe", { width, height }),
    setWrap: (wrap) => invoke<void>("set_wrap", { wrap }),
    clear: () => frame("clear"),
    randomize: (density) => frame("randomize", { density }),
    setCells: (cells) => frame("set_cells", { cells }),

    getRule: () => invoke<RuleInfo>("get_rule"),
    parseRule: (text) => invoke<RuleInfo>("parse_rule", { text }),
    applyRule: (rule) => invoke<RuleInfo>("apply_rule", { rule }),
    applyRuleString: (text) => invoke<RuleInfo>("apply_rule_string", { text }),

    parsePattern: (text) => invoke<Pattern>("parse_pattern", { text }),
    exportRle: () => invoke<string>("export_rle"),
    listPresets: () => invoke<Presets>("list_presets"),

    getLibrary: () => invoke<Library>("get_library"),
    saveRule: (name, rule, description) => invoke<Library>("save_rule", { name, rule, description }),
    deleteRule: (name) => invoke<Library>("delete_rule", { name }),
    savePattern: (name, rle) => invoke<Library>("save_pattern", { name, rle }),
    deletePattern: (name) => invoke<Library>("delete_pattern", { name }),

    async openTextFile(kind) {
      const path = await open({ multiple: false, directory: false, filters: FILTERS[kind] });
      if (typeof path !== "string") return null;
      const text = await invoke<string>("read_text_file", { path });
      return { name: path.split(/[\\/]/).pop() ?? path, text };
    },

    async saveTextFile(kind, defaultName, content) {
      const path = await save({ filters: FILTERS[kind], defaultPath: defaultName });
      if (!path) return null;
      await invoke<void>("write_text_file", { path, content });
      return path;
    },
  };
}
