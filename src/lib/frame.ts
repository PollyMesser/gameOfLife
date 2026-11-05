import type { Frame } from "./types";

const HEADER = 24;

function toBuffer(raw: unknown): ArrayBuffer {
  if (raw instanceof ArrayBuffer) return raw;
  if (ArrayBuffer.isView(raw)) {
    const v = raw as Uint8Array;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[]).buffer;
  throw new Error("Unerwartetes Frame-Format");
}

/** Header: generation u64 | population u32 | width u32 | height u32 | reserved u32, danach Zellbytes */
export function decodeFrame(raw: unknown): Frame {
  const buf = toBuffer(raw);
  const dv = new DataView(buf);
  const width = dv.getUint32(12, true);
  const height = dv.getUint32(16, true);
  return {
    generation: Number(dv.getBigUint64(0, true)),
    population: dv.getUint32(8, true),
    width,
    height,
    cells: new Uint8Array(buf, HEADER, width * height),
  };
}
