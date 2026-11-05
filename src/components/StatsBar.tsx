import { useEffect, useRef } from "react";
import type { Frame } from "../lib/types";

export interface Sample {
  gen: number;
  pop: number;
}

interface Props {
  frame: Frame | null;
  history: Sample[];
  version: number;
  gensPerSec: number;
  rule: string;
  color: string;
}

const fmt = (n: number) => n.toLocaleString("de-DE");

export function StatsBar({ frame, history, version, gensPerSec, rule, color }: Props) {
  const prev = history.length > 1 ? history[history.length - 2].pop : null;
  const delta = frame && prev !== null ? frame.population - prev : 0;
  const total = frame ? frame.width * frame.height : 1;
  const peak = history.reduce((m, s) => Math.max(m, s.pop), 0);

  return (
    <div className="stats">
      <Stat label="Generation" value={frame ? fmt(frame.generation) : "–"} />
      <Stat
        label="Population"
        value={frame ? fmt(frame.population) : "–"}
        sub={frame ? `${((frame.population / total) * 100).toFixed(1)} %` : ""}
      />
      <Stat label="Δ" value={(delta > 0 ? "+" : "") + fmt(delta)} tone={delta > 0 ? "up" : delta < 0 ? "down" : ""} />
      <Stat label="Maximum" value={fmt(peak)} />
      <Stat label="Gen/s" value={gensPerSec ? gensPerSec.toFixed(0) : "–"} />
      <div className="chart">
        <PopulationChart history={history} version={version} color={color} />
      </div>
      <div className="stat rule-stat">
        <span className="stat-label">Regel</span>
        <span className="stat-value mono" title={rule}>{rule}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={"stat-value mono " + (tone ?? "")}>{value}</span>
      {sub && <span className="stat-sub mono">{sub}</span>}
    </div>
  );
}

function PopulationChart({ history, version, color }: { history: Sample[]; version: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) {
      ctx.fillStyle = "rgba(180,200,220,0.35)";
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.fillText("Populationsverlauf erscheint beim Abspielen", 8, h / 2 + 4);
      return;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const s of history) {
      min = Math.min(min, s.pop);
      max = Math.max(max, s.pop);
    }
    if (max === min) {
      max += 1;
      min = Math.max(0, min - 1);
    }
    const pad = 4;
    const x = (i: number) => pad + (i / (history.length - 1)) * (w - 2 * pad);
    const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - 2 * pad);

    ctx.beginPath();
    history.forEach((s, i) => (i === 0 ? ctx.moveTo(x(i), y(s.pop)) : ctx.lineTo(x(i), y(s.pop))));
    ctx.lineTo(x(history.length - 1), h);
    ctx.lineTo(x(0), h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + "55");
    grad.addColorStop(1, color + "00");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    history.forEach((s, i) => (i === 0 ? ctx.moveTo(x(i), y(s.pop)) : ctx.lineTo(x(i), y(s.pop))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    for (const [label, ty] of [
      [fmt(max), 11],
      [fmt(min), h - 3],
    ] as const) {
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(14,19,26,0.85)";
      ctx.fillRect(w - tw - 6, ty - 9, tw + 6, 12);
      ctx.fillStyle = "rgba(180,200,220,0.7)";
      ctx.fillText(label, w - 3, ty);
    }
    ctx.textAlign = "left";
  }, [history, version, color]);
  return <canvas ref={ref} />;
}
