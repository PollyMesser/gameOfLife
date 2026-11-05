// Platzhalter, solange src/wasm/pkg noch nicht gebaut ist (z. B. beim reinen Desktop-Build).
// Die Web-Variante wird nur im Browser geladen; dort fuehrt dieser Fehler zu einer klaren Meldung.
export default async function init(): Promise<never> {
  throw new Error("WASM-Engine fehlt – bitte zuerst `npm run build:wasm` ausführen.");
}
export class WebSim {}
export const parseRule = () => undefined;
export const parsePattern = () => undefined;
export const presets = () => undefined;
