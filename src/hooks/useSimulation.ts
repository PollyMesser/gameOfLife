import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { Frame } from "../lib/types";

/**
 * Taktgeber: fordert pro Animationsframe so viele Generationen an, wie das Tempo verlangt.
 * speed = 0 bedeutet "so schnell wie moeglich" (das Backend begrenzt auf ~40 ms pro Aufruf).
 * Es laeuft nie mehr als ein step-Aufruf gleichzeitig.
 */
export function useSimulation(
  running: boolean,
  speed: number,
  onFrame: (f: Frame) => void,
  onError: (e: unknown) => void,
) {
  const cb = useRef({ onFrame, onError });
  cb.current = { onFrame, onError };

  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let busy = false;
    let raf = 0;
    let last = performance.now();
    let acc = 1; // sofort ein Schritt beim Start

    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (speed > 0) acc += dt * speed;
      if (!busy) {
        let count = speed === 0 ? 1000 : Math.floor(acc);
        if (count > 0) {
          if (speed > 0) acc -= count;
          count = Math.min(count, 1000);
          busy = true;
          api
            .step(count)
            .then((f) => !stopped && cb.current.onFrame(f))
            .catch((e) => !stopped && cb.current.onError(e))
            .finally(() => (busy = false));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [running, speed]);
}
