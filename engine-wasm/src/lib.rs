//! Browser-Anbindung der Engine (wasm-bindgen).
//!
//! Spiegelt die Tauri-Befehle aus `src-tauri/src/commands.rs`, damit das React-Frontend
//! mit beiden Backends identisch arbeitet. Speicherung und Dateizugriff erledigt das
//! Frontend selbst (localStorage, Upload/Download).

use life_engine::{
    encode_rle, parse_rle, CompiledRule, Rule, RuleInfo, Universe, MAX_PATTERN_CELLS, PRESETS,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

fn js_err(msg: impl AsRef<str>) -> JsValue {
    JsValue::from_str(msg.as_ref())
}

#[wasm_bindgen]
pub struct WebSim {
    universe: Universe,
    rule: Rule,
    compiled: CompiledRule,
}

#[wasm_bindgen]
impl WebSim {
    /// Neue Simulation mit Conway-Regel und zufaelliger Startbelegung.
    /// `seed` kommt aus JavaScript (Math.random), da wasm32 keine eigene Zufallsquelle hat.
    #[wasm_bindgen(constructor)]
    pub fn new(width: usize, height: usize, wrap: bool, seed: f64) -> WebSim {
        let rule = Rule::default();
        let mut universe = Universe::new(width, height, wrap);
        universe.randomize(0.25, Some(seed as u64));
        WebSim {
            compiled: CompiledRule::from(&rule),
            rule,
            universe,
        }
    }

    /// Header (24 Byte) + Zellen, identisch zum Desktop-Frame.
    pub fn frame(&self) -> Vec<u8> {
        self.universe.frame_bytes()
    }

    /// Rechnet `count` Generationen ohne Frame-Ausgabe (Zeitbudget steuert JS).
    pub fn advance(&mut self, count: u32) {
        for _ in 0..count {
            self.universe.step(&self.compiled);
        }
    }

    #[wasm_bindgen(js_name = newUniverse)]
    pub fn new_universe(&mut self, width: usize, height: usize, wrap: bool) {
        self.universe = Universe::new(width, height, wrap);
    }

    pub fn resize(&mut self, width: usize, height: usize) {
        self.universe.resize(width, height);
    }

    #[wasm_bindgen(js_name = setWrap)]
    pub fn set_wrap(&mut self, wrap: bool) {
        self.universe.set_wrap(wrap);
    }

    pub fn clear(&mut self) {
        self.universe.clear();
    }

    pub fn randomize(&mut self, density: f32, seed: f64) {
        self.universe.randomize(density, Some(seed as u64));
    }

    /// `flat` = [x0, y0, zustand0, x1, y1, zustand1, ...]
    #[wasm_bindgen(js_name = setCells)]
    pub fn set_cells(&mut self, flat: Vec<i32>) {
        let max = self.rule.states as i32 - 1;
        for c in flat.chunks_exact(3) {
            self.universe
                .set(c[0] as i64, c[1] as i64, c[2].clamp(0, max) as u8);
        }
    }

    #[wasm_bindgen(js_name = getRule)]
    pub fn get_rule(&self) -> Result<JsValue, JsValue> {
        to_js(&RuleInfo::from(self.rule.clone()))
    }

    #[wasm_bindgen(js_name = applyRule)]
    pub fn apply_rule(&mut self, rule: JsValue) -> Result<JsValue, JsValue> {
        let rule: Rule = serde_wasm_bindgen::from_value(rule).map_err(|e| js_err(e.to_string()))?;
        rule.validate().map_err(js_err)?;
        self.set_rule(rule.normalized());
        self.get_rule()
    }

    #[wasm_bindgen(js_name = applyRuleString)]
    pub fn apply_rule_string(&mut self, text: &str) -> Result<JsValue, JsValue> {
        let rule = Rule::parse(text).map_err(js_err)?;
        self.set_rule(rule);
        self.get_rule()
    }

    #[wasm_bindgen(js_name = exportRle)]
    pub fn export_rle(&self) -> String {
        encode_rle(&self.universe, &self.rule.to_rule_string(), self.rule.states)
    }

    fn set_rule(&mut self, rule: Rule) {
        self.universe.clamp_states(rule.states);
        self.compiled = CompiledRule::from(&rule);
        self.rule = rule;
    }
}

#[wasm_bindgen(js_name = parseRule)]
pub fn parse_rule(text: &str) -> Result<JsValue, JsValue> {
    to_js(&RuleInfo::from(Rule::parse(text).map_err(js_err)?))
}

#[wasm_bindgen(js_name = parsePattern)]
pub fn parse_pattern(text: &str) -> Result<JsValue, JsValue> {
    let p = parse_rle(text).map_err(js_err)?;
    if p.cells.len() > MAX_PATTERN_CELLS {
        return Err(js_err("Muster ist zu gross"));
    }
    to_js(&p)
}

#[wasm_bindgen]
pub fn presets() -> Result<JsValue, JsValue> {
    to_js(&PRESETS)
}
