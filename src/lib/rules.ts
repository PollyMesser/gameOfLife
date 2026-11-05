import type { Neighborhood, Rule } from "./types";

export const MAX_RADIUS = 10;
export const MAX_STATES = 255;

export function neighborhoodSize(nb: Neighborhood, r: number): number {
  switch (nb) {
    case "moore":
      return (2 * r + 1) ** 2 - 1;
    case "vonNeumann":
      return 2 * r * (r + 1);
    case "hex":
      return 3 * r * (r + 1);
  }
}

export function maxCount(rule: Rule): number {
  return neighborhoodSize(rule.neighborhood, rule.radius) + (rule.includeCenter ? 1 : 0);
}

/** Gehoert (dx, dy) zur Nachbarschaft? (gleiche Definition wie in der Engine) */
export function inNeighborhood(nb: Neighborhood, r: number, dx: number, dy: number): boolean {
  switch (nb) {
    case "moore":
      return Math.abs(dx) <= r && Math.abs(dy) <= r;
    case "vonNeumann":
      return Math.abs(dx) + Math.abs(dy) <= r;
    case "hex":
      return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx - dy)) <= r;
  }
}

export function family(rule: Rule): string {
  if (rule.radius > 1 || rule.includeCenter) return rule.states > 2 ? "LtL + Generations" : "Larger than Life";
  if (rule.states > 2) return "Generations";
  return "Life-like";
}

export const NEIGHBORHOOD_LABEL: Record<Neighborhood, string> = {
  moore: "Moore",
  vonNeumann: "Von Neumann",
  hex: "Hexagonal",
};

/** [2,3,4,8] -> "2-4,8" */
export function formatCounts(v: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    const start = v[i];
    let end = start;
    while (i + 1 < v.length && v[i + 1] === end + 1) end = v[++i];
    out.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return out.join(",");
}

/** "2-4, 8" bzw. "34..58" -> sortierte Liste; wirft bei Fehlern */
export function parseCounts(text: string, max: number): number[] {
  const set = new Set<number>();
  for (const raw of text.split(",")) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^(\d+)\s*(?:(?:-|\.\.)\s*(\d+))?$/);
    if (!m) throw new Error(`Ungueltig: "${tok}"`);
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    if (a > b) throw new Error(`Bereich "${tok}" ist absteigend`);
    if (b > max) throw new Error(`${b} > Maximum ${max}`);
    for (let n = a; n <= b; n++) set.add(n);
  }
  return [...set].sort((x, y) => x - y);
}
