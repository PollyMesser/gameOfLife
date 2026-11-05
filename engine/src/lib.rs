//! life-engine – Simulationskern fuer zellulaere Automaten.
//!
//! * [`rule`]    – Regelmodell + Parser/Formatter (B/S, S/B, Generations, HROT/LtL)
//! * [`universe`] – Gitter und Simulationsschritt
//! * [`rle`]     – RLE-Import/-Export
//! * [`presets`] – eingebaute Regeln und Muster
//!
//! Feature `parallel` (Standard): Mehrkern-Simulation mit rayon. Fuer WebAssembly
//! mit `default-features = false` einbinden.

pub mod presets;
pub mod rle;
pub mod rule;
pub mod universe;

pub use presets::{Presets, PRESETS};
pub use rle::{encode_rle, parse_rle, Pattern};
pub use rule::{Neighborhood, Rule, RuleInfo};
pub use universe::{CompiledRule, Universe, FRAME_HEADER_LEN, MAX_SIZE, MIN_SIZE};

/// Obergrenze fuer importierte Muster (Zellen), gilt fuer Desktop und Web.
pub const MAX_PATTERN_CELLS: usize = 4_000_000;
