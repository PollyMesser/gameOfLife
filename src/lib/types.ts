export type Neighborhood = "moore" | "vonNeumann" | "hex";

export interface Rule {
  neighborhood: Neighborhood;
  radius: number;
  states: number;
  includeCenter: boolean;
  birth: number[];
  survival: number[];
}

export interface RuleInfo {
  rule: Rule;
  canonical: string;
  maxCount: number;
}

export type Cell = [x: number, y: number, state: number];

export interface Pattern {
  width: number;
  height: number;
  rule: string | null;
  name: string | null;
  cells: Cell[];
}

export interface RulePreset {
  name: string;
  category: string;
  rule: string;
  description: string;
}

export interface PatternPreset {
  name: string;
  category: string;
  rle: string;
  description: string;
}

export interface Presets {
  rules: RulePreset[];
  patterns: PatternPreset[];
}

export interface SavedRule {
  name: string;
  rule: string;
  description: string;
}

export interface SavedPattern {
  name: string;
  rle: string;
}

export interface Library {
  rules: SavedRule[];
  patterns: SavedPattern[];
  dataDir: string;
}

export interface Frame {
  generation: number;
  population: number;
  width: number;
  height: number;
  cells: Uint8Array;
}

export interface Placement {
  name: string;
  width: number;
  height: number;
  cells: Cell[];
  rule: string | null;
}

export interface Colors {
  background: string;
  alive: string;
  dying: string;
}
