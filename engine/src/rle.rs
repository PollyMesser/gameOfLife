use crate::universe::Universe;
use serde::{Deserialize, Serialize};

/// Ein Muster in relativen Koordinaten.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pattern {
    pub width: u32,
    pub height: u32,
    pub rule: Option<String>,
    pub name: Option<String>,
    /// `[x, y, state]`
    pub cells: Vec<[u32; 3]>,
}

/// Parst das RLE-Format (Golly/LifeWiki), inkl. Mehrzustands-Notation (`.`, `A`–`X`, `pA`…).
pub fn parse_rle(text: &str) -> Result<Pattern, String> {
    let mut width = 0u32;
    let mut height = 0u32;
    let mut rule = None;
    let mut name = None;
    let mut body = String::new();
    let mut header_seen = false;

    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Some(rest) = t.strip_prefix('#') {
            if let Some(n) = rest.strip_prefix('N') {
                name = Some(n.trim().to_string()).filter(|s| !s.is_empty());
            }
            continue;
        }
        if !header_seen && t.starts_with('x') && t.contains('=') {
            header_seen = true;
            let (dims, rule_part) = match t.find("rule") {
                Some(i) => (&t[..i], Some(&t[i..])),
                None => (t, None),
            };
            for kv in dims.split(',') {
                if let Some((k, v)) = kv.split_once('=') {
                    match k.trim() {
                        "x" => width = v.trim().parse().unwrap_or(0),
                        "y" => height = v.trim().parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }
            if let Some(rp) = rule_part {
                if let Some((_, v)) = rp.split_once('=') {
                    let v = v.trim();
                    if !v.is_empty() {
                        rule = Some(v.to_string());
                    }
                }
            }
            continue;
        }
        body.push_str(t);
        if t.contains('!') {
            break;
        }
    }

    let mut cells = Vec::new();
    let (mut x, mut y) = (0u32, 0u32);
    let mut count: Option<u32> = None;
    let mut prefix: Option<char> = None;
    let (mut max_x, mut max_y) = (0u32, 0u32);

    for c in body.chars() {
        let n = count.unwrap_or(1);
        match c {
            '0'..='9' => {
                let d = c.to_digit(10).unwrap();
                let v = count.unwrap_or(0).saturating_mul(10).saturating_add(d);
                if v > 100_000 {
                    return Err("Laufzahl zu gross".into());
                }
                count = Some(v);
                continue;
            }
            'b' | '.' => x += n,
            'o' | 'A'..='X' => {
                let base = if c == 'o' { 1 } else { c as u32 - 'A' as u32 + 1 };
                let state = match prefix.take() {
                    Some(p) => (p as u32 - 'p' as u32 + 1) * 24 + base,
                    None => base,
                };
                if state > 255 {
                    return Err("Zustand > 255".into());
                }
                for _ in 0..n {
                    cells.push([x, y, state]);
                    max_x = max_x.max(x + 1);
                    max_y = max_y.max(y + 1);
                    x += 1;
                }
            }
            'p'..='y' => {
                prefix = Some(c);
                continue;
            }
            '$' => {
                y += n;
                x = 0;
            }
            '!' => break,
            c if c.is_whitespace() => continue,
            other => return Err(format!("Unerwartetes Zeichen '{other}' im RLE")),
        }
        count = None;
    }

    if cells.is_empty() && body.is_empty() {
        return Err("Kein RLE-Inhalt gefunden".into());
    }
    Ok(Pattern {
        width: width.max(max_x),
        height: height.max(max_y),
        rule,
        name,
        cells,
    })
}

fn state_token(state: u8, states: u8) -> String {
    if states <= 2 {
        return if state == 0 { "b" } else { "o" }.into();
    }
    match state {
        0 => ".".into(),
        1..=24 => ((b'A' + state - 1) as char).to_string(),
        k => {
            let q = (k as u32 - 1) / 24;
            let l = (k as u32 - 1) % 24;
            format!(
                "{}{}",
                (b'p' + (q - 1) as u8) as char,
                (b'A' + l as u8) as char
            )
        }
    }
}

/// Exportiert den belegten Bereich des Universums als RLE.
pub fn encode_rle(u: &Universe, rule: &str, states: u8) -> String {
    let Some((x0, y0, x1, y1)) = u.bounding_box() else {
        return format!("x = 0, y = 0, rule = {rule}\n!\n");
    };
    let mut tokens: Vec<String> = Vec::new();
    let mut pending_rows = 0u32;
    for y in y0..=y1 {
        let row: Vec<u8> = (x0..=x1).map(|x| u.get(x, y)).collect();
        let Some(last) = row.iter().rposition(|&c| c != 0) else {
            pending_rows += 1;
            continue;
        };
        if y > y0 {
            let n = pending_rows + 1;
            tokens.push(if n > 1 { format!("{n}$") } else { "$".into() });
        }
        pending_rows = 0;
        let mut i = 0;
        while i <= last {
            let s = row[i];
            let mut j = i;
            while j <= last && row[j] == s {
                j += 1;
            }
            let run = j - i;
            let t = state_token(s, states);
            tokens.push(if run > 1 { format!("{run}{t}") } else { t });
            i = j;
        }
    }
    tokens.push("!".into());

    let mut out = format!("x = {}, y = {}, rule = {rule}\n", x1 - x0 + 1, y1 - y0 + 1);
    let mut line = String::new();
    for t in tokens {
        if line.len() + t.len() > 70 {
            out.push_str(&line);
            out.push('\n');
            line.clear();
        }
        line.push_str(&t);
    }
    out.push_str(&line);
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_glider_with_header() {
        let p = parse_rle("#N Glider\nx = 3, y = 3, rule = B3/S23\nbob$2bo$3o!").unwrap();
        assert_eq!(p.name.as_deref(), Some("Glider"));
        assert_eq!(p.rule.as_deref(), Some("B3/S23"));
        assert_eq!((p.width, p.height), (3, 3));
        assert_eq!(p.cells.len(), 5);
    }

    #[test]
    fn hrot_rule_with_commas_in_header() {
        let p = parse_rle("x = 1, y = 1, rule = R5,C0,M1,S34..58,B34..45,NM\no!").unwrap();
        assert_eq!(p.rule.as_deref(), Some("R5,C0,M1,S34..58,B34..45,NM"));
    }

    #[test]
    fn roundtrip_multistate() {
        let mut u = Universe::new(40, 40, false);
        u.set(3, 3, 1);
        u.set(4, 3, 2);
        u.set(5, 3, 30);
        u.set(3, 7, 1);
        let rle = encode_rle(&u, "B2/S/C40", 40);
        let p = parse_rle(&rle).unwrap();
        let mut cells = p.cells.clone();
        cells.sort();
        assert_eq!(cells, vec![[0, 0, 1], [0, 4, 1], [1, 0, 2], [2, 0, 30]]);
        assert_eq!((p.width, p.height), (3, 5));
    }

    #[test]
    fn roundtrip_two_state() {
        let gun = "24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!";
        let p = parse_rle(gun).unwrap();
        let mut u = Universe::new(64, 64, false);
        for c in &p.cells {
            u.set(c[0] as i64 + 5, c[1] as i64 + 5, c[2] as u8);
        }
        let back = parse_rle(&encode_rle(&u, "B3/S23", 2)).unwrap();
        let mut a = p.cells.clone();
        let mut b = back.cells.clone();
        a.sort();
        b.sort();
        assert_eq!(a, b);
        assert_eq!(p.cells.len(), 36);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_rle("x = 3, y = 3\nzz?!").is_err());
    }
}
