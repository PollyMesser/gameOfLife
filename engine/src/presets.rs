use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePreset {
    pub name: &'static str,
    pub category: &'static str,
    pub rule: &'static str,
    pub description: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternPreset {
    pub name: &'static str,
    pub category: &'static str,
    pub rle: &'static str,
    pub description: &'static str,
}

const fn r(
    name: &'static str,
    category: &'static str,
    rule: &'static str,
    description: &'static str,
) -> RulePreset {
    RulePreset {
        name,
        category,
        rule,
        description,
    }
}

pub const RULE_PRESETS: &[RulePreset] = &[
    // Life-like
    r("Conway's Life", "Life-like", "B3/S23", "Das Original."),
    r("HighLife", "Life-like", "B36/S23", "Wie Life, mit Replikator."),
    r("Day & Night", "Life-like", "B3678/S34678", "Symmetrisch: Lebend und tot sind austauschbar."),
    r("Seeds", "Life-like", "B2/S", "Explosiv, keine Zelle ueberlebt."),
    r("Life without Death", "Life-like", "B3/S012345678", "Einmal lebendig, immer lebendig."),
    r("Maze", "Life-like", "B3/S12345", "Waechst zu Labyrinthen."),
    r("Mazectric", "Life-like", "B3/S1234", "Labyrinthe mit langen Gaengen."),
    r("Replicator", "Life-like", "B1357/S1357", "Jedes Muster kopiert sich selbst."),
    r("2x2", "Life-like", "B36/S125", "Bloecke aus 2x2-Zellen."),
    r("Morley", "Life-like", "B368/S245", "Viele Raumschiffe."),
    r("Anneal", "Life-like", "B4678/S35678", "Mehrheitsregel mit Glaettung."),
    r("Diamoeba", "Life-like", "B35678/S5678", "Amoebenartige Rauten."),
    r("Coral", "Life-like", "B3/S45678", "Langsam wachsende Korallen."),
    r("Gnarl", "Life-like", "B1/S1", "Knorrige Fraktale aus einer Zelle."),
    r("Long Life", "Life-like", "B345/S5", "Oszillatoren mit langer Periode."),
    // Andere Nachbarschaften
    r("Hex Life", "Hex / Von Neumann", "B2/S34H", "Life auf hexagonalem Gitter."),
    r("Hex Seeds", "Hex / Von Neumann", "B2/SH", "Seeds auf Hex-Gitter."),
    r("Von-Neumann-Fraktal", "Hex / Von Neumann", "B1/S1V", "Rautenfraktale mit 4 Nachbarn."),
    r("VN Wachstum", "Hex / Von Neumann", "B13/S0123V", "Wachsende Rauten."),
    // Generations
    r("Brian's Brain", "Generations", "B2/S/C3", "Funken und Raumschiffe ohne Ende."),
    r("Star Wars", "Generations", "B2/S345/C4", "Laserstrahlen und Raumschiffe."),
    r("Frogs", "Generations", "B34/S12/C3", "Huepfende Strukturen."),
    r("Bombers", "Generations", "B24/S345/C25", "Langsam verglimmende Explosionen."),
    r("Fireworks", "Generations", "B13/S2/C21", "Feuerwerk aus Einzelzellen."),
    r("Hex Brain", "Generations", "B2/S/C3H", "Brian's Brain auf Hex-Gitter."),
    // Larger than Life
    r("Bosco's Rule", "Larger than Life", "R5,C0,M1,S34..58,B34..45,NM", "Grosse, gleitende Blobs (Bugs)."),
    r("Majority", "Larger than Life", "R4,C0,M1,S41..81,B41..81,NM", "Mehrheitsentscheid - bildet Regionen."),
    r("Waffle", "Larger than Life", "R7,C0,M1,S100..200,B75..170,NM", "Waffelartige Strukturen."),
    r("Globe", "Larger than Life", "R8,C0,M0,S163..223,B74..252,NM", "Kugelige Gebilde."),
    r("LtL Generations", "Larger than Life", "R3,C6,M0,S8..14,B9..12,NM", "Grosser Radius mit Nachleuchten."),
];

const fn p(
    name: &'static str,
    category: &'static str,
    rle: &'static str,
    description: &'static str,
) -> PatternPreset {
    PatternPreset {
        name,
        category,
        rle,
        description,
    }
}

pub const PATTERN_PRESETS: &[PatternPreset] = &[
    p("Glider", "Raumschiffe", "x = 3, y = 3, rule = B3/S23\nbob$2bo$3o!", "Der kleinste Gleiter."),
    p("Lightweight Spaceship", "Raumschiffe", "x = 5, y = 4, rule = B3/S23\nbo2bo$o4b$o3bo$4o!", "LWSS, Periode 4."),
    p("Blinker", "Oszillatoren", "x = 3, y = 1, rule = B3/S23\n3o!", "Periode 2."),
    p("Pulsar", "Oszillatoren", "x = 13, y = 13, rule = B3/S23\n2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!", "Periode 3."),
    p("Pentadecathlon", "Oszillatoren", "x = 10, y = 3, rule = B3/S23\n2bo4bo2b$2ob4ob2o$2bo4bo!", "Periode 15."),
    p("Gosper Glider Gun", "Kanonen", "x = 36, y = 9, rule = B3/S23\n24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!", "Erzeugt alle 30 Generationen einen Gleiter."),
    p("R-Pentomino", "Methusalems", "x = 3, y = 3, rule = B3/S23\nb2o$2o$bo!", "Stabilisiert sich erst nach 1103 Generationen."),
    p("Acorn", "Methusalems", "x = 7, y = 3, rule = B3/S23\nbo5b$3bo3b$2o2b3o!", "7 Zellen, 5206 Generationen."),
    p("Diehard", "Methusalems", "x = 8, y = 3, rule = B3/S23\n6bob$2o6b$bo3b3o!", "Stirbt nach genau 130 Generationen."),
    p("Replikator", "HighLife", "x = 5, y = 5, rule = B36/S23\n2b3o$bo2bo$o3bo$o2bo$3o!", "Kopiert sich in HighLife selbst."),
    p("Funke", "Brian's Brain", "x = 2, y = 2, rule = B2/S/C3\n2A$2A!", "Startpunkt fuer Brian's Brain."),
];

/// Alle Vorlagen zusammen, wie sie an das Frontend gehen.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Presets {
    pub rules: &'static [RulePreset],
    pub patterns: &'static [PatternPreset],
}

pub const PRESETS: Presets = Presets {
    rules: RULE_PRESETS,
    patterns: PATTERN_PRESETS,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{parse_rle, Rule};

    #[test]
    fn all_presets_parse() {
        for p in RULE_PRESETS {
            Rule::parse(p.rule).unwrap_or_else(|e| panic!("{}: {e}", p.name));
        }
        for p in PATTERN_PRESETS {
            let pat = parse_rle(p.rle).unwrap_or_else(|e| panic!("{}: {e}", p.name));
            assert!(!pat.cells.is_empty(), "{}", p.name);
            if let Some(r) = &pat.rule {
                Rule::parse(r).unwrap();
            }
        }
    }
}
