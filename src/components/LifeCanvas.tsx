import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from "react";
import { buildPalette } from "../lib/palette";
import type { Cell, Colors, Frame, Placement } from "../lib/types";

export interface LifeCanvasHandle {
  fit: () => void;
}

interface Props {
  frame: Frame | null;
  hex: boolean;
  states: number;
  colors: Colors;
  showGrid: boolean;
  placement: Placement | null;
  onPaint: (cells: Cell[]) => void;
  onPlace: (x: number, y: number) => void;
}

interface View {
  zoom: number; // CSS-Pixel pro Zelle
  ox: number; // Bildschirmposition von Zelle (0,0)
  oy: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 64;

/** Bresenham-Linie, damit schnelle Mausbewegungen keine Luecken lassen. */
function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

export const LifeCanvas = forwardRef<LifeCanvasHandle, Props>(function LifeCanvas(
  { frame, hex, states, colors, showGrid, placement, onPaint, onPlace },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<ImageData | null>(null);
  const viewRef = useRef<View>({ zoom: 4, ox: 0, oy: 0 });
  const frameRef = useRef<Frame | null>(null);
  const hoverRef = useRef<[number, number] | null>(null);
  const paletteRef = useRef<Uint32Array>(buildPalette(colors, states));
  const fittedFor = useRef<string>("");
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [zoomLabel, setZoomLabel] = useState(4);

  const skew = hex ? -0.5 : 0;

  // ---------- Zeichnen ----------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const off = offRef.current;
    const f = frameRef.current;
    if (!canvas || !off || !f) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const { zoom: z, ox, oy } = viewRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#06090d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * z, 0, dpr * z * skew, dpr * z, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0);

    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    if (showGrid && z >= 6) {
      const y0 = Math.max(0, Math.floor(-oy / z));
      const y1 = Math.min(f.height, Math.ceil((ch - oy) / z));
      const xs = [(-ox) / z - skew * y0, (-ox) / z - skew * y1, (cw - ox) / z - skew * y0, (cw - ox) / z - skew * y1];
      const x0 = Math.max(0, Math.floor(Math.min(...xs)));
      const x1 = Math.min(f.width, Math.ceil(Math.max(...xs)));
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.strokeStyle = "rgba(160, 200, 255, 0.07)";
      ctx.lineWidth = 1 / (z * dpr);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(125, 255, 179, 0.25)";
    ctx.lineWidth = 1.5 / (z * dpr);
    ctx.strokeRect(0, 0, f.width, f.height);

    const h = hoverRef.current;
    if (placement && h) {
      const bx = h[0] - Math.floor(placement.width / 2);
      const by = h[1] - Math.floor(placement.height / 2);
      ctx.fillStyle = "rgba(255, 210, 90, 0.18)";
      ctx.fillRect(bx, by, placement.width, placement.height);
      ctx.fillStyle = "rgba(255, 210, 90, 0.85)";
      for (const [x, y] of placement.cells) ctx.fillRect(bx + x, by + y, 1, 1);
    } else if (h && z >= 3) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1 / (z * dpr);
      ctx.strokeRect(h[0], h[1], 1, 1);
    }
  }, [placement, showGrid, skew]);

  const writeImage = useCallback(() => {
    const f = frameRef.current;
    if (!f) return;
    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offRef.current = off;
    }
    if (off.width !== f.width || off.height !== f.height || !imgRef.current) {
      off.width = f.width;
      off.height = f.height;
      imgRef.current = new ImageData(f.width, f.height);
    }
    const img = imgRef.current;
    const px = new Uint32Array(img.data.buffer);
    const pal = paletteRef.current;
    const cells = f.cells;
    for (let i = 0; i < cells.length; i++) px[i] = pal[cells[i]];
    off.getContext("2d")!.putImageData(img, 0, 0);
  }, []);

  // ---------- Ansicht ----------
  const fit = useCallback(() => {
    const el = wrapRef.current;
    const f = frameRef.current;
    if (!el || !f) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const left = Math.min(0, skew * f.height);
    const right = Math.max(f.width, f.width + skew * f.height);
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(cw / (right - left), ch / f.height) * 0.94));
    viewRef.current = {
      zoom: z,
      ox: (cw - (right - left) * z) / 2 - left * z,
      oy: (ch - f.height * z) / 2,
    };
    setZoomLabel(z);
    redraw();
  }, [redraw, skew]);

  useImperativeHandle(ref, () => ({ fit }), [fit]);

  useEffect(() => {
    paletteRef.current = buildPalette(colors, states);
    writeImage();
    redraw();
  }, [colors, states, writeImage, redraw]);

  useEffect(() => {
    frameRef.current = frame;
    if (!frame) return;
    writeImage();
    const key = `${frame.width}x${frame.height}:${hex}`;
    if (fittedFor.current !== key) {
      fittedFor.current = key;
      fit();
    } else {
      redraw();
    }
  }, [frame, hex, fit, redraw, writeImage]);

  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(el.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(el.clientHeight * dpr));
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(redraw, [redraw]);

  // ---------- Eingabe ----------
  const toCell = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { zoom: z, ox, oy } = viewRef.current;
    const gy = (e.clientY - rect.top - oy) / z;
    const gx = (e.clientX - rect.left - ox) / z - skew * gy;
    return [Math.floor(gx), Math.floor(gy)];
  };

  const stroke = useRef<{ mode: "paint" | "pan"; state: number; last: [number, number]; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const pending = useRef<Cell[]>([]);
  const flushQueued = useRef(false);

  const queuePaint = (pts: [number, number][], state: number) => {
    const f = frameRef.current;
    const img = imgRef.current;
    if (!f) return;
    const px = img ? new Uint32Array(img.data.buffer) : null;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= f.width || y >= f.height) continue;
      pending.current.push([x, y, state]);
      f.cells[y * f.width + x] = state; // sofortiges Feedback
      if (px) px[y * f.width + x] = paletteRef.current[state];
    }
    if (img && offRef.current) offRef.current.getContext("2d")!.putImageData(img, 0, 0);
    redraw();
    if (!flushQueued.current) {
      flushQueued.current = true;
      requestAnimationFrame(() => {
        flushQueued.current = false;
        const batch = pending.current;
        pending.current = [];
        if (batch.length) onPaint(batch);
      });
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const cell = toCell(e);
    const { ox, oy } = viewRef.current;
    if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.altKey))) {
      stroke.current = { mode: "pan", state: 0, last: cell, sx: e.clientX, sy: e.clientY, ox, oy };
      return;
    }
    if (placement && e.button === 0) {
      onPlace(cell[0] - Math.floor(placement.width / 2), cell[1] - Math.floor(placement.height / 2));
      return;
    }
    const f = frameRef.current;
    if (!f) return;
    let state = 0;
    if (e.button === 0) {
      const inside = cell[0] >= 0 && cell[1] >= 0 && cell[0] < f.width && cell[1] < f.height;
      const cur = inside ? f.cells[cell[1] * f.width + cell[0]] : 0;
      state = cur === 0 ? 1 : 0; // Klick auf lebende Zelle = Radieren
    }
    stroke.current = { mode: "paint", state, last: cell, sx: e.clientX, sy: e.clientY, ox, oy };
    queuePaint([cell], state);
  };

  const onPointerMove = (e: PointerEvent) => {
    const cell = toCell(e);
    const prev = hoverRef.current;
    if (!prev || prev[0] !== cell[0] || prev[1] !== cell[1]) {
      hoverRef.current = cell;
      setHover(cell);
      if (!stroke.current) redraw();
    }
    const s = stroke.current;
    if (!s) return;
    if (s.mode === "pan") {
      viewRef.current = { ...viewRef.current, ox: s.ox + e.clientX - s.sx, oy: s.oy + e.clientY - s.sy };
      redraw();
    } else if (cell[0] !== s.last[0] || cell[1] !== s.last[1]) {
      queuePaint(line(s.last[0], s.last[1], cell[0], cell[1]).slice(1), s.state);
      s.last = cell;
    }
  };

  const endStroke = () => {
    stroke.current = null;
  };

  // Wheel muss non-passive sein, damit preventDefault wirkt
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const v = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.0018);
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
      viewRef.current = {
        zoom: z,
        ox: px - ((px - v.ox) * z) / v.zoom,
        oy: py - ((py - v.oy) * z) / v.zoom,
      };
      setZoomLabel(z);
      redraw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [redraw]);

  const f = frame;
  const hoverState =
    f && hover && hover[0] >= 0 && hover[1] >= 0 && hover[0] < f.width && hover[1] < f.height
      ? f.cells[hover[1] * f.width + hover[0]]
      : null;

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={placement ? "placing" : ""}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={() => {
          hoverRef.current = null;
          setHover(null);
          redraw();
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="canvas-hud">
        {hover && hoverState !== null ? (
          <span>
            x {hover[0]} · y {hover[1]} · Zustand {hoverState}
          </span>
        ) : (
          <span>Linksklick zeichnen · Rechtsklick radieren · Shift/Mitte ziehen = verschieben</span>
        )}
        <span className="hud-zoom">{zoomLabel >= 1 ? zoomLabel.toFixed(1) : zoomLabel.toFixed(2)}×</span>
      </div>
    </div>
  );
});
