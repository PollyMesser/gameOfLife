use crate::rule::Rule;
#[cfg(feature = "parallel")]
use rayon::prelude::*;

pub const MIN_SIZE: usize = 32;
pub const MAX_SIZE: usize = 4096;
/// Header eines Frames: generation u64 | population u32 | width u32 | height u32 | reserved u32
pub const FRAME_HEADER_LEN: usize = 24;

/// Vorberechnete Form einer Regel fuer den Simulationsschritt.
#[derive(Clone, Debug)]
pub struct CompiledRule {
    spans: Vec<(i32, i32, i32)>,
    birth: Vec<bool>,
    survival: Vec<bool>,
    states: u8,
    include_center: bool,
}

impl From<&Rule> for CompiledRule {
    fn from(rule: &Rule) -> Self {
        let r = rule.radius as usize;
        let len = (2 * r + 1) * (2 * r + 1) + 1;
        let table = |v: &[u16]| {
            let mut t = vec![false; len];
            for &n in v {
                if (n as usize) < len {
                    t[n as usize] = true;
                }
            }
            t
        };
        CompiledRule {
            spans: rule.neighborhood.spans(rule.radius),
            birth: table(&rule.birth),
            survival: table(&rule.survival),
            states: rule.states,
            include_center: rule.include_center,
        }
    }
}

/// Rechteckiges Gitter, wahlweise toroidal (Raender verbunden) oder begrenzt.
#[derive(Clone, Debug)]
pub struct Universe {
    width: usize,
    height: usize,
    wrap: bool,
    cells: Vec<u8>,
    next: Vec<u8>,
    prefix: Vec<u32>,
    generation: u64,
}

impl Universe {
    pub fn new(width: usize, height: usize, wrap: bool) -> Self {
        let width = width.clamp(MIN_SIZE, MAX_SIZE);
        let height = height.clamp(MIN_SIZE, MAX_SIZE);
        Universe {
            width,
            height,
            wrap,
            cells: vec![0; width * height],
            next: vec![0; width * height],
            prefix: vec![0; (width + 1) * height],
            generation: 0,
        }
    }

    pub fn width(&self) -> usize {
        self.width
    }
    pub fn height(&self) -> usize {
        self.height
    }
    pub fn wrap(&self) -> bool {
        self.wrap
    }
    pub fn generation(&self) -> u64 {
        self.generation
    }
    pub fn cells(&self) -> &[u8] {
        &self.cells
    }
    pub fn set_wrap(&mut self, wrap: bool) {
        self.wrap = wrap;
    }

    /// Anzahl lebender Zellen (Zustand 1).
    pub fn population(&self) -> u32 {
        #[cfg(feature = "parallel")]
        let n = self.cells.par_iter().filter(|&&c| c == 1).count();
        #[cfg(not(feature = "parallel"))]
        let n = self.cells.iter().filter(|&&c| c == 1).count();
        n as u32
    }

    pub fn get(&self, x: usize, y: usize) -> u8 {
        self.cells[y * self.width + x]
    }

    /// Setzt eine Zelle; Koordinaten ausserhalb werden (je nach wrap) umgebrochen bzw. ignoriert.
    pub fn set(&mut self, x: i64, y: i64, state: u8) {
        let (w, h) = (self.width as i64, self.height as i64);
        let (x, y) = if self.wrap {
            (x.rem_euclid(w), y.rem_euclid(h))
        } else if x < 0 || y < 0 || x >= w || y >= h {
            return;
        } else {
            (x, y)
        };
        self.cells[(y * w + x) as usize] = state;
    }

    pub fn clear(&mut self) {
        self.cells.fill(0);
        self.generation = 0;
    }

    pub fn randomize(&mut self, density: f32, seed: Option<u64>) {
        let mut rng = match seed {
            Some(s) => fastrand::Rng::with_seed(s),
            None => fastrand::Rng::new(),
        };
        let d = density.clamp(0.0, 1.0);
        for c in &mut self.cells {
            *c = (rng.f32() < d) as u8;
        }
        self.generation = 0;
    }

    /// Entfernt Zustaende, die es in der neuen Regel nicht gibt.
    pub fn clamp_states(&mut self, states: u8) {
        for c in &mut self.cells {
            if *c >= states {
                *c = 0;
            }
        }
    }

    /// Groesse aendern; Inhalt bleibt zentriert erhalten.
    pub fn resize(&mut self, width: usize, height: usize) {
        let mut n = Universe::new(width, height, self.wrap);
        let ox = (n.width as i64 - self.width as i64) / 2;
        let oy = (n.height as i64 - self.height as i64) / 2;
        for y in 0..self.height {
            for x in 0..self.width {
                let s = self.get(x, y);
                if s != 0 {
                    let (nx, ny) = (x as i64 + ox, y as i64 + oy);
                    if nx >= 0 && ny >= 0 && (nx as usize) < n.width && (ny as usize) < n.height {
                        n.cells[ny as usize * n.width + nx as usize] = s;
                    }
                }
            }
        }
        n.generation = self.generation;
        *self = n;
    }

    /// Bounding-Box aller Zellen != 0 als (x0, y0, x1, y1) inklusive.
    pub fn bounding_box(&self) -> Option<(usize, usize, usize, usize)> {
        let mut bb: Option<(usize, usize, usize, usize)> = None;
        for y in 0..self.height {
            let row = &self.cells[y * self.width..(y + 1) * self.width];
            if let (Some(a), Some(b)) = (
                row.iter().position(|&c| c != 0),
                row.iter().rposition(|&c| c != 0),
            ) {
                bb = Some(match bb {
                    None => (a, y, b, y),
                    Some((x0, y0, x1, _)) => (x0.min(a), y0, x1.max(b), y),
                });
            }
        }
        bb
    }

    /// Ein Generationsschritt.
    ///
    /// Nachbarn werden ueber Zeilen-Praefixsummen gezaehlt: pro Zelle ist der Aufwand
    /// O(2r+1) statt O((2r+1)^2), was grosse LtL-Radien schnell macht.
    /// Mit Feature `parallel` (Desktop) zeilenweise auf allen Kernen, sonst (WASM) sequenziell.
    pub fn step(&mut self, rule: &CompiledRule) {
        let w = self.width;
        let pw = w + 1;
        let grid = Grid {
            width: w,
            height: self.height,
            wrap: self.wrap,
        };

        #[cfg(feature = "parallel")]
        {
            self.prefix
                .par_chunks_mut(pw)
                .zip(self.cells.par_chunks(w))
                .for_each(|(p, row)| prefix_row(p, row));
            let (prefix, cells) = (&self.prefix, &self.cells);
            self.next
                .par_chunks_mut(w)
                .enumerate()
                .for_each(|(y, out)| next_row(&grid, rule, prefix, cells, y, out));
        }
        #[cfg(not(feature = "parallel"))]
        {
            self.prefix
                .chunks_mut(pw)
                .zip(self.cells.chunks(w))
                .for_each(|(p, row)| prefix_row(p, row));
            let (prefix, cells) = (&self.prefix, &self.cells);
            self.next
                .chunks_mut(w)
                .enumerate()
                .for_each(|(y, out)| next_row(&grid, rule, prefix, cells, y, out));
        }

        std::mem::swap(&mut self.cells, &mut self.next);
        self.generation += 1;
    }

    /// Serialisiert Header + Zellbytes fuer das Frontend.
    pub fn frame_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(FRAME_HEADER_LEN + self.cells.len());
        out.extend_from_slice(&self.generation.to_le_bytes());
        out.extend_from_slice(&self.population().to_le_bytes());
        out.extend_from_slice(&(self.width as u32).to_le_bytes());
        out.extend_from_slice(&(self.height as u32).to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&self.cells);
        out
    }
}

struct Grid {
    width: usize,
    height: usize,
    wrap: bool,
}

#[inline]
fn prefix_row(p: &mut [u32], row: &[u8]) {
    p[0] = 0;
    for x in 0..row.len() {
        p[x + 1] = p[x] + (row[x] == 1) as u32;
    }
}

/// Berechnet Zeile `y` der naechsten Generation.
#[inline]
fn next_row(g: &Grid, rule: &CompiledRule, prefix: &[u32], cells: &[u8], y: usize, out: &mut [u8]) {
    let (w, h, wrap) = (g.width, g.height, g.wrap);
    let pw = w + 1;
    for (x, o) in out.iter_mut().enumerate() {
        let mut n: u32 = 0;
        for &(dy, lo, hi) in &rule.spans {
            let yy = y as i32 + dy;
            let yy = if wrap {
                yy.rem_euclid(h as i32) as usize
            } else if yy < 0 || yy >= h as i32 {
                continue;
            } else {
                yy as usize
            };
            let p = &prefix[yy * pw..(yy + 1) * pw];
            n += range_sum(p, x as i32 + lo, x as i32 + hi, w as i32, wrap);
        }
        let s = cells[y * w + x];
        if s == 1 && !rule.include_center {
            n -= 1;
        }
        let n = n as usize;
        *o = match s {
            0 => rule.birth[n] as u8,
            1 => {
                if rule.survival[n] {
                    1
                } else if rule.states > 2 {
                    2
                } else {
                    0
                }
            }
            k => {
                if k + 1 < rule.states {
                    k + 1
                } else {
                    0
                }
            }
        };
    }
}

/// Summe lebender Zellen in Zeile `p` (Praefixsumme) von Spalte a bis b inklusive.
/// Erwartet a <= 0-Offset <= b und (b - a + 1) <= w.
#[inline(always)]
fn range_sum(p: &[u32], a: i32, b: i32, w: i32, wrap: bool) -> u32 {
    if a >= 0 && b < w {
        return p[(b + 1) as usize] - p[a as usize];
    }
    if !wrap {
        let a = a.max(0);
        let b = b.min(w - 1);
        return if a > b {
            0
        } else {
            p[(b + 1) as usize] - p[a as usize]
        };
    }
    if a < 0 {
        (p[w as usize] - p[(w + a) as usize]) + p[(b + 1) as usize]
    } else {
        (p[w as usize] - p[a as usize]) + p[(b - w + 1) as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rle::parse_rle;
    use crate::rule::Neighborhood;

    fn place(u: &mut Universe, rle: &str, x: i64, y: i64) {
        let p = parse_rle(rle).unwrap();
        for c in p.cells {
            u.set(x + c[0] as i64, y + c[1] as i64, c[2] as u8);
        }
    }

    fn alive(u: &Universe) -> Vec<(usize, usize)> {
        let mut v = vec![];
        for y in 0..u.height() {
            for x in 0..u.width() {
                if u.get(x, y) == 1 {
                    v.push((x, y));
                }
            }
        }
        v
    }

    #[test]
    fn blinker_oscillates() {
        let r = CompiledRule::from(&Rule::default());
        let mut u = Universe::new(32, 32, false);
        place(&mut u, "3o!", 10, 10);
        u.step(&r);
        assert_eq!(alive(&u), vec![(11, 9), (11, 10), (11, 11)]);
        u.step(&r);
        assert_eq!(alive(&u), vec![(10, 10), (11, 10), (12, 10)]);
    }

    #[test]
    fn glider_moves_and_wraps() {
        let r = CompiledRule::from(&Rule::default());
        let mut u = Universe::new(32, 32, true);
        place(&mut u, "bob$2bo$3o!", 0, 0);
        let start = alive(&u);
        for _ in 0..(4 * 32) {
            u.step(&r);
        }
        // Nach 4*32 Generationen ist der Gleiter einmal um den Torus gelaufen.
        assert_eq!(alive(&u), start);
        assert_eq!(u.generation(), 128);
    }

    #[test]
    fn diehard_dies_after_130() {
        let r = CompiledRule::from(&Rule::default());
        let mut u = Universe::new(200, 200, false);
        place(&mut u, "6bob$2o6b$bo3b3o!", 95, 95);
        for _ in 0..129 {
            u.step(&r);
        }
        assert!(u.population() > 0);
        u.step(&r);
        assert_eq!(u.population(), 0);
    }

    #[test]
    fn generations_decay() {
        let rule = Rule::parse("B2/S/C3").unwrap();
        let r = CompiledRule::from(&rule);
        let mut u = Universe::new(32, 32, false);
        u.set(5, 5, 1);
        u.step(&r);
        assert_eq!(u.get(5, 5), 2, "lebend -> sterbend");
        u.step(&r);
        assert_eq!(u.get(5, 5), 0, "sterbend -> tot");
    }

    #[test]
    fn neighbor_counts_per_shape() {
        // Eine einzelne Zelle und B1 -> alle Nachbarn werden geboren.
        for (nb, expected) in [
            (Neighborhood::Moore, 8),
            (Neighborhood::VonNeumann, 4),
            (Neighborhood::Hex, 6),
        ] {
            let rule = Rule {
                neighborhood: nb,
                birth: vec![1],
                survival: vec![],
                ..Rule::default()
            };
            let mut u = Universe::new(32, 32, true);
            u.set(0, 0, 1); // am Rand -> testet auch wrap
            u.step(&CompiledRule::from(&rule));
            assert_eq!(u.population(), expected, "{nb:?}");
        }
        // LtL mit Radius 3 und Zentrum mitgezaehlt
        let rule = Rule::parse("R3,C0,M1,S1,B1,NM").unwrap();
        let mut u = Universe::new(40, 40, false);
        u.set(20, 20, 1);
        u.step(&CompiledRule::from(&rule));
        assert_eq!(u.population(), 49);
    }

    #[test]
    fn bounded_edges_do_not_wrap() {
        let rule = Rule {
            birth: vec![1],
            survival: vec![],
            ..Rule::default()
        };
        let mut u = Universe::new(32, 32, false);
        u.set(0, 0, 1);
        u.step(&CompiledRule::from(&rule));
        assert_eq!(u.population(), 3);
    }

    #[test]
    fn resize_keeps_center() {
        let mut u = Universe::new(32, 32, false);
        u.set(16, 16, 1);
        u.resize(64, 64);
        assert_eq!(u.get(32, 32), 1);
        assert_eq!(u.bounding_box(), Some((32, 32, 32, 32)));
    }
}
