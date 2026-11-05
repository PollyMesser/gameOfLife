import type { Cell, Frame, Library, Pattern, Presets, Rule, RuleInfo } from "../types";

export type FileKind = "rle" | "json";

export interface OpenedFile {
  name: string;
  text: string;
}

/**
 * Gemeinsame Schnittstelle fuer beide Laufzeitumgebungen:
 * - Desktop: Tauri-Befehle (Rust nativ, mehrkernig)
 * - Web: dieselbe Rust-Engine als WebAssembly im Browser
 */
export interface Backend {
  platform: "desktop" | "web";

  getFrame(): Promise<Frame>;
  step(count: number): Promise<Frame>;
  newUniverse(width: number, height: number, wrap: boolean): Promise<Frame>;
  resize(width: number, height: number): Promise<Frame>;
  setWrap(wrap: boolean): Promise<void>;
  clear(): Promise<Frame>;
  randomize(density: number): Promise<Frame>;
  setCells(cells: Cell[]): Promise<Frame>;

  getRule(): Promise<RuleInfo>;
  parseRule(text: string): Promise<RuleInfo>;
  applyRule(rule: Rule): Promise<RuleInfo>;
  applyRuleString(text: string): Promise<RuleInfo>;

  parsePattern(text: string): Promise<Pattern>;
  exportRle(): Promise<string>;
  listPresets(): Promise<Presets>;

  getLibrary(): Promise<Library>;
  saveRule(name: string, rule: string, description: string): Promise<Library>;
  deleteRule(name: string): Promise<Library>;
  savePattern(name: string, rle: string): Promise<Library>;
  deletePattern(name: string): Promise<Library>;

  /** Datei waehlen und lesen; null bei Abbruch. */
  openTextFile(kind: FileKind): Promise<OpenedFile | null>;
  /** Datei speichern; liefert Ort/Name oder null bei Abbruch. */
  saveTextFile(kind: FileKind, defaultName: string, content: string): Promise<string | null>;
}
