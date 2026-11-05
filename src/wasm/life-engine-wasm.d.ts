// Typen der WASM-Engine (engine-wasm/src/lib.rs).
// Der Modulname wird in vite.config.ts auf src/wasm/pkg/ (Ausgabe von scripts/build-wasm.sh) gemappt.
declare module "life-engine-wasm" {
  export default function init(input?: unknown): Promise<unknown>;

  export class WebSim {
    constructor(width: number, height: number, wrap: boolean, seed: number);
    free(): void;
    frame(): Uint8Array;
    advance(count: number): void;
    newUniverse(width: number, height: number, wrap: boolean): void;
    resize(width: number, height: number): void;
    setWrap(wrap: boolean): void;
    clear(): void;
    randomize(density: number, seed: number): void;
    setCells(flat: Int32Array): void;
    getRule(): unknown;
    applyRule(rule: unknown): unknown;
    applyRuleString(text: string): unknown;
    exportRle(): string;
  }

  export function parseRule(text: string): unknown;
  export function parsePattern(text: string): unknown;
  export function presets(): unknown;
}
