import type { Colors } from "./types";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const pack = ([r, g, b]: [number, number, number]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

/**
 * Farbe je Zustand fuer ImageData (little endian ABGR).
 * Zustand 0 = Hintergrund, 1 = lebendig, 2..n-1 = sterbend (verblasst Richtung Hintergrund).
 */
export function buildPalette(colors: Colors, states: number): Uint32Array {
  const pal = new Uint32Array(256);
  const bg = hexToRgb(colors.background);
  const alive = hexToRgb(colors.alive);
  const dying = hexToRgb(colors.dying);
  pal.fill(pack(bg));
  pal[1] = pack(alive);
  const dyingCount = Math.max(0, states - 2);
  for (let k = 0; k < dyingCount; k++) {
    const t = dyingCount === 1 ? 0 : k / dyingCount; // 0 = frisch, ->1 = fast tot
    const fade = 0.15 + 0.85 * (1 - t);
    pal[k + 2] = pack([
      Math.round(bg[0] + (dying[0] - bg[0]) * fade),
      Math.round(bg[1] + (dying[1] - bg[1]) * fade),
      Math.round(bg[2] + (dying[2] - bg[2]) * fade),
    ]);
  }
  return pal;
}

export const DEFAULT_COLORS: Colors = {
  background: "#0a0e13",
  alive: "#7dffb3",
  dying: "#ff8f3d",
};
