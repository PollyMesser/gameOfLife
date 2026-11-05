use serde::{Deserialize, Serialize};
use std::fmt::Write;

pub const MAX_RADIUS: u8 = 10;
pub const MAX_STATES: u8 = 255;

/// Form der Nachbarschaft.
///
/// `Hex` arbeitet auf axialen Koordinaten in einem quadratischen Gitter:
/// Nachbarn sind alle Zellen mit Hex-Distanz `max(|dx|, |dy|, |dx - dy|) <= r`.
/// Darstellung: jede Zeile wird um eine halbe Zelle nach links verschoben.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Neighborhood {
    Moore,
    VonNeumann,
    Hex,
}

impl Neighborhood {
    /// Anzahl Nachbarn (ohne Zentrum) bei Radius `r`.
    pub fn size(self, r: u8) -> u16 {
        let r = r as u16;
        match self {
            Neighborhood::Moore => (2 * r + 1) * (2 * r + 1) - 1,
            Neighborhood::VonNeumann => 2 * r * (r + 1),
            Neighborhood::Hex => 3 * r * (r + 1),
        }
    }

    /// Zeilenweise Spannen `(dy, dx_min, dx_max)` inklusive Zentrum.
    pub fn spans(self, r: u8) -> Vec<(i32, i32, i32)> {
        let r = r as i32;
        (-r..=r)
            .map(|dy| match self {
                Neighborhood::Moore => (dy, -r, r),
                Neighborhood::VonNeumann => {
                    let k = r - dy.abs();
                    (dy, -k, k)
                }
                Neighborhood::Hex => (dy, (-r).max(dy - r), r.min(dy + r)),
            })
            .collect()
    }

    fn code(self) -> char {
        match self {
            Neighborhood::Moore => 'M',
            Neighborhood::VonNeumann => 'N',
            Neighborhood::Hex => 'H',
        }
    }
}

/// Einheitliches Regelmodell fuer alle unterstuetzten Familien.
///
/// * Life-like:        radius 1, states 2
/// * Generations:      states > 2 (Zustand 1 = lebendig, 2.. = sterbend)
/// * Larger than Life: radius > 1 (optional mit Zentrum gezaehlt)
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub neighborhood: Neighborhood,
    pub radius: u8,
    pub states: u8,
    pub include_center: bool,
    pub birth: Vec<u16>,
    pub survival: Vec<u16>,
}

impl Default for Rule {
    fn default() -> Self {
        Rule {
            neighborhood: Neighborhood::Moore,
            radius: 1,
            states: 2,
            include_center: false,
            birth: vec![3],
            survival: vec![2, 3],
        }
    }
}

impl Rule {
    /// Hoechste moegliche Nachbarzahl.
    pub fn max_count(&self) -> u16 {
        self.neighborhood.size(self.radius) + self.include_center as u16
    }

    /// Sortiert/entdoppelt Listen und klemmt Parameter in gueltige Bereiche.
    pub fn normalized(mut self) -> Self {
        self.radius = self.radius.clamp(1, MAX_RADIUS);
        self.states = self.states.clamp(2, MAX_STATES);
        let max = self.max_count();
        for v in [&mut self.birth, &mut self.survival] {
            v.sort_unstable();
            v.dedup();
            v.retain(|&n| n <= max);
        }
        self
    }

    pub fn validate(&self) -> Result<(), String> {
        if !(1..=MAX_RADIUS).contains(&self.radius) {
            return Err(format!("Radius muss zwischen 1 und {MAX_RADIUS} liegen"));
        }
        if self.states < 2 {
            return Err("Mindestens 2 Zustaende noetig".into());
        }
        let max = self.max_count();
        if let Some(n) = self.birth.iter().chain(&self.survival).find(|&&n| n > max) {
            return Err(format!(
                "Nachbarzahl {n} ist zu gross (Maximum bei dieser Nachbarschaft: {max})"
            ));
        }
        Ok(())
    }

    /// Kanonische Schreibweise: kompakt (`B3/S23`, `B2/S/C3`, `B2/S34H`) bei Radius 1,
    /// sonst HROT/LtL (`R5,C0,M1,S34-58,B34-45,NM`).
    pub fn to_rule_string(&self) -> String {
        if self.radius == 1 && !self.include_center {
            let mut s = format!("B{}/S{}", digits(&self.birth), digits(&self.survival));
            if self.states > 2 {
                let _ = write!(s, "/C{}", self.states);
            }
            match self.neighborhood {
                Neighborhood::Moore => {}
                Neighborhood::VonNeumann => s.push('V'),
                Neighborhood::Hex => s.push('H'),
            }
            s
        } else {
            format!(
                "R{},C{},M{},S{},B{},N{}",
                self.radius,
                if self.states > 2 { self.states } else { 0 },
                self.include_center as u8,
                ranges(&self.survival),
                ranges(&self.birth),
                self.neighborhood.code()
            )
        }
    }

    /// Parst B/S (`B3/S23`), S/B (`23/3`), Generations (`B2/S/C3`, `345/2/4`),
    /// Suffix `H`/`V` sowie HROT/LtL (`R5,C0,M1,S34..58,B34..45,NM`).
    pub fn parse(input: &str) -> Result<Rule, String> {
        let s: String = input
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_ascii_uppercase();
        if s.is_empty() {
            return Err("Leere Regel".into());
        }
        let rule = if s.starts_with('R') && s[1..].starts_with(|c: char| c.is_ascii_digit()) {
            parse_hrot(&s)?
        } else {
            parse_bs(&s)?
        };
        rule.validate()?;
        Ok(rule.normalized())
    }
}

/// Regel samt kanonischer Schreibweise – so wird sie an das Frontend geliefert.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleInfo {
    pub rule: Rule,
    pub canonical: String,
    pub max_count: u16,
}

impl From<Rule> for RuleInfo {
    fn from(rule: Rule) -> Self {
        RuleInfo {
            canonical: rule.to_rule_string(),
            max_count: rule.max_count(),
            rule,
        }
    }
}

fn digits(v: &[u16]) -> String {
    v.iter().map(|n| n.to_string()).collect()
}

fn ranges(v: &[u16]) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < v.len() {
        let start = v[i];
        let mut end = start;
        while i + 1 < v.len() && v[i + 1] == end + 1 {
            i += 1;
            end = v[i];
        }
        out.push(if start == end {
            start.to_string()
        } else {
            format!("{start}-{end}")
        });
        i += 1;
    }
    out.join(",")
}

/// Parst eine Bereichsliste wie `2-3,8` oder `34..58` (auch fuer die UI nuetzlich).
pub fn parse_count_list(s: &str) -> Result<Vec<u16>, String> {
    let mut v = Vec::new();
    for tok in s.split(',').map(str::trim).filter(|t| !t.is_empty()) {
        push_range(&mut v, tok)?;
    }
    v.sort_unstable();
    v.dedup();
    Ok(v)
}

fn push_range(v: &mut Vec<u16>, tok: &str) -> Result<(), String> {
    let num = |t: &str| {
        t.parse::<u16>()
            .map_err(|_| format!("Ungueltige Zahl '{t}'"))
    };
    let (a, b) = if let Some((a, b)) = tok.split_once("..") {
        (num(a)?, num(b)?)
    } else if let Some((a, b)) = tok.split_once('-') {
        (num(a)?, num(b)?)
    } else {
        let n = num(tok)?;
        (n, n)
    };
    if a > b {
        return Err(format!("Bereich '{tok}' ist absteigend"));
    }
    if b > 1000 {
        return Err(format!("Bereich '{tok}' ist zu gross"));
    }
    v.extend(a..=b);
    Ok(())
}

fn parse_hrot(s: &str) -> Result<Rule, String> {
    let mut rule = Rule {
        neighborhood: Neighborhood::Moore,
        radius: 1,
        states: 2,
        include_center: false,
        birth: vec![],
        survival: vec![],
    };
    // Aktuelle Liste fuer Folgetokens wie in "S2-3,8,B3"
    let mut current: Option<char> = None;
    for tok in s.split(',').filter(|t| !t.is_empty()) {
        let first = tok.chars().next().unwrap();
        if first.is_ascii_alphabetic() {
            let rest = &tok[1..];
            current = None;
            match first {
                'R' => {
                    rule.radius = rest
                        .parse()
                        .map_err(|_| format!("Ungueltiger Radius '{rest}'"))?
                }
                'C' => {
                    let c: u16 = rest
                        .parse()
                        .map_err(|_| format!("Ungueltige Zustandszahl '{rest}'"))?;
                    if c > MAX_STATES as u16 {
                        return Err(format!("Hoechstens {MAX_STATES} Zustaende"));
                    }
                    rule.states = (c as u8).max(2);
                }
                'M' => rule.include_center = rest == "1",
                'S' | 'B' => {
                    current = Some(first);
                    let target = if first == 'S' {
                        &mut rule.survival
                    } else {
                        &mut rule.birth
                    };
                    if !rest.is_empty() {
                        push_range(target, rest)?;
                    }
                }
                'N' => {
                    rule.neighborhood = match rest {
                        "" | "M" => Neighborhood::Moore,
                        "N" => Neighborhood::VonNeumann,
                        "H" => Neighborhood::Hex,
                        other => return Err(format!("Unbekannte Nachbarschaft 'N{other}'")),
                    }
                }
                other => return Err(format!("Unbekannter Schluessel '{other}'")),
            }
        } else {
            match current {
                Some('S') => push_range(&mut rule.survival, tok)?,
                Some('B') => push_range(&mut rule.birth, tok)?,
                _ => return Err(format!("Unerwartetes Token '{tok}'")),
            }
        }
    }
    Ok(rule)
}

fn parse_digits(p: &str) -> Result<Vec<u16>, String> {
    p.chars()
        .map(|c| {
            c.to_digit(10)
                .map(|d| d as u16)
                .ok_or_else(|| format!("Ungueltiges Zeichen '{c}'"))
        })
        .collect()
}

fn parse_states(p: &str) -> Result<u8, String> {
    let n: u16 = p
        .parse()
        .map_err(|_| format!("Ungueltige Zustandszahl '{p}'"))?;
    if n > MAX_STATES as u16 {
        return Err(format!("Hoechstens {MAX_STATES} Zustaende"));
    }
    Ok((n as u8).max(2))
}

fn parse_bs(s: &str) -> Result<Rule, String> {
    let (body, neighborhood) = match s.chars().last() {
        Some('H') => (&s[..s.len() - 1], Neighborhood::Hex),
        Some('V') => (&s[..s.len() - 1], Neighborhood::VonNeumann),
        _ => (s, Neighborhood::Moore),
    };
    let parts: Vec<&str> = body.split('/').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return Err("Erwartet z. B. B3/S23, 23/3 oder B2/S/C3".into());
    }
    let mut rule = Rule {
        neighborhood,
        radius: 1,
        states: 2,
        include_center: false,
        birth: vec![],
        survival: vec![],
    };
    let lettered = parts.iter().any(|p| p.starts_with('B') || p.starts_with('S'));
    if lettered {
        for p in parts {
            match p.chars().next() {
                Some('B') => rule.birth = parse_digits(&p[1..])?,
                Some('S') => rule.survival = parse_digits(&p[1..])?,
                Some('C') | Some('G') => rule.states = parse_states(&p[1..])?,
                Some(c) if c.is_ascii_digit() => rule.states = parse_states(p)?,
                _ => return Err(format!("Unbekannter Regelteil '{p}'")),
            }
        }
    } else {
        rule.survival = parse_digits(parts[0])?;
        rule.birth = parse_digits(parts[1])?;
        if let Some(c) = parts.get(2) {
            rule.states = parse_states(c)?;
        }
    }
    Ok(rule)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conway_variants() {
        let a = Rule::parse("B3/S23").unwrap();
        let b = Rule::parse("23/3").unwrap();
        let c = Rule::parse("b3/s23").unwrap();
        assert_eq!(a, Rule::default());
        assert_eq!(a, b);
        assert_eq!(a, c);
        assert_eq!(a.to_rule_string(), "B3/S23");
    }

    #[test]
    fn generations() {
        let r = Rule::parse("B2/S/C3").unwrap();
        assert_eq!(r.states, 3);
        assert!(r.survival.is_empty());
        assert_eq!(Rule::parse("/2/3").unwrap(), r);
        assert_eq!(r.to_rule_string(), "B2/S/C3");
        let sw = Rule::parse("345/2/4").unwrap();
        assert_eq!(sw.survival, vec![3, 4, 5]);
        assert_eq!(sw.birth, vec![2]);
        assert_eq!(sw.states, 4);
    }

    #[test]
    fn neighborhood_suffix() {
        let h = Rule::parse("B2/S34H").unwrap();
        assert_eq!(h.neighborhood, Neighborhood::Hex);
        assert_eq!(h.to_rule_string(), "B2/S34H");
        assert!(Rule::parse("B7/S1H").is_err(), "Hex hat nur 6 Nachbarn");
        assert!(Rule::parse("B5/S1V").is_err(), "VN hat nur 4 Nachbarn");
    }

    #[test]
    fn ltl_and_hrot() {
        let b = Rule::parse("R5,C0,M1,S34..58,B34..45,NM").unwrap();
        assert_eq!(b.radius, 5);
        assert!(b.include_center);
        assert_eq!(b.survival.len(), 25);
        assert_eq!(b.to_rule_string(), "R5,C0,M1,S34-58,B34-45,NM");
        assert_eq!(Rule::parse(&b.to_rule_string()).unwrap(), b);

        let h = Rule::parse("R2,C3,S2-3,8,B3,NN").unwrap();
        assert_eq!(h.survival, vec![2, 3, 8]);
        assert_eq!(h.birth, vec![3]);
        assert_eq!(h.states, 3);
        assert_eq!(h.neighborhood, Neighborhood::VonNeumann);
        let empty = Rule::parse("R2,C0,M0,S,B3,NH").unwrap();
        assert!(empty.survival.is_empty());
        assert_eq!(Rule::parse(&empty.to_rule_string()).unwrap(), empty);
    }

    #[test]
    fn spans_match_size() {
        for nb in [Neighborhood::Moore, Neighborhood::VonNeumann, Neighborhood::Hex] {
            for r in 1..=MAX_RADIUS {
                let cells: i32 = nb.spans(r).iter().map(|&(_, lo, hi)| hi - lo + 1).sum();
                assert_eq!(cells as u16 - 1, nb.size(r), "{nb:?} r={r}");
            }
        }
    }

    #[test]
    fn errors() {
        assert!(Rule::parse("").is_err());
        assert!(Rule::parse("B9/S23").is_err());
        assert!(Rule::parse("hallo").is_err());
        assert!(Rule::parse("R11,C0,S1,B1,NM").is_err());
    }
}
