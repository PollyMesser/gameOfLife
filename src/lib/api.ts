import type { Backend } from "./backend/types";

let backend: Backend | null = null;

/** Laeuft die App in Tauri (Desktop) oder im Browser? */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Waehlt beim Start das passende Backend. Beide Varianten werden per dynamic import
 * geladen, damit die Web-Version keinen Tauri-Code und die Desktop-Version kein WASM laedt.
 */
export async function initBackend(): Promise<Backend> {
  backend = isTauri()
    ? (await import("./backend/tauri")).createTauriBackend()
    : await (await import("./backend/web")).createWebBackend();
  return backend;
}

/** Zugriff auf das aktive Backend (nach initBackend). */
export const api: Backend = new Proxy({} as Backend, {
  get(_, key) {
    if (!backend) throw new Error("Backend noch nicht initialisiert");
    return backend[key as keyof Backend];
  },
});

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}
