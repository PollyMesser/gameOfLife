//! IPC-Schnittstelle zwischen React-Frontend und Engine.
//!
//! Frames werden als rohe Bytes (`ipc::Response`) uebertragen, nicht als JSON –
//! im Frontend kommen sie als `ArrayBuffer` an.

use crate::storage::{self, Library, SavedPattern, SavedRule};
use life_engine::{
    encode_rle, parse_rle, CompiledRule, Pattern, Presets, Rule, RuleInfo, Universe,
    MAX_PATTERN_CELLS, PRESETS,
};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Response;
use tauri::State;

/// Zeitbudget pro `step`-Aufruf, damit die UI auch bei grossen Regeln fluessig bleibt.
const STEP_BUDGET: Duration = Duration::from_millis(40);

struct Sim {
    universe: Universe,
    rule: Rule,
    compiled: CompiledRule,
}

impl Sim {
    fn set_rule(&mut self, rule: Rule) {
        self.universe.clamp_states(rule.states);
        self.compiled = CompiledRule::from(&rule);
        self.rule = rule;
    }
}

pub struct AppState {
    sim: Mutex<Sim>,
    data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let rule = Rule::default();
        let mut universe = Universe::new(256, 192, true);
        universe.randomize(0.25, None);
        AppState {
            sim: Mutex::new(Sim {
                compiled: CompiledRule::from(&rule),
                rule,
                universe,
            }),
            data_dir,
        }
    }

    fn with_sim<T>(&self, f: impl FnOnce(&mut Sim) -> T) -> Result<T, String> {
        let mut guard = self.sim.lock().map_err(|_| "Simulation blockiert".to_string())?;
        Ok(f(&mut *guard))
    }

    fn frame(&self, f: impl FnOnce(&mut Sim)) -> Result<Response, String> {
        self.with_sim(|s| {
            f(s);
            Response::new(s.universe.frame_bytes())
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInfo {
    #[serde(flatten)]
    library: Library,
    data_dir: String,
}

// ---------- Simulation ----------

#[tauri::command]
pub async fn get_frame(state: State<'_, AppState>) -> Result<Response, String> {
    state.frame(|_| {})
}

#[tauri::command]
pub async fn step(state: State<'_, AppState>, count: u32) -> Result<Response, String> {
    state.frame(|s| {
        let start = Instant::now();
        for _ in 0..count.clamp(1, 1000) {
            s.universe.step(&s.compiled);
            if start.elapsed() > STEP_BUDGET {
                break;
            }
        }
    })
}

#[tauri::command]
pub async fn new_universe(
    state: State<'_, AppState>,
    width: usize,
    height: usize,
    wrap: bool,
) -> Result<Response, String> {
    state.frame(|s| s.universe = Universe::new(width, height, wrap))
}

#[tauri::command]
pub async fn resize_universe(
    state: State<'_, AppState>,
    width: usize,
    height: usize,
) -> Result<Response, String> {
    state.frame(|s| s.universe.resize(width, height))
}

#[tauri::command]
pub async fn set_wrap(state: State<'_, AppState>, wrap: bool) -> Result<(), String> {
    state.with_sim(|s| s.universe.set_wrap(wrap))
}

#[tauri::command]
pub async fn clear(state: State<'_, AppState>) -> Result<Response, String> {
    state.frame(|s| s.universe.clear())
}

#[tauri::command]
pub async fn randomize(state: State<'_, AppState>, density: f32) -> Result<Response, String> {
    state.frame(|s| s.universe.randomize(density, None))
}

/// `cells`: Liste aus `[x, y, zustand]`
#[tauri::command]
pub async fn set_cells(
    state: State<'_, AppState>,
    cells: Vec<[i64; 3]>,
) -> Result<Response, String> {
    state.frame(|s| {
        let max = s.rule.states as i64 - 1;
        for [x, y, st] in cells {
            s.universe.set(x, y, st.clamp(0, max) as u8);
        }
    })
}

// ---------- Regeln ----------

#[tauri::command]
pub async fn get_rule(state: State<'_, AppState>) -> Result<RuleInfo, String> {
    state.with_sim(|s| s.rule.clone().into())
}

/// Nur parsen (fuer Live-Validierung im Editor).
#[tauri::command]
pub async fn parse_rule(text: String) -> Result<RuleInfo, String> {
    Rule::parse(&text).map(Into::into)
}

#[tauri::command]
pub async fn apply_rule(state: State<'_, AppState>, rule: Rule) -> Result<RuleInfo, String> {
    rule.validate()?;
    let rule = rule.normalized();
    state.with_sim(|s| {
        s.set_rule(rule.clone());
        rule.into()
    })
}

#[tauri::command]
pub async fn apply_rule_string(
    state: State<'_, AppState>,
    text: String,
) -> Result<RuleInfo, String> {
    let rule = Rule::parse(&text)?;
    state.with_sim(|s| {
        s.set_rule(rule.clone());
        rule.into()
    })
}

// ---------- Muster ----------

#[tauri::command]
pub async fn parse_pattern(text: String) -> Result<Pattern, String> {
    let p = parse_rle(&text)?;
    if p.cells.len() > MAX_PATTERN_CELLS {
        return Err("Muster ist zu gross".into());
    }
    Ok(p)
}

#[tauri::command]
pub async fn export_rle(state: State<'_, AppState>) -> Result<String, String> {
    state.with_sim(|s| encode_rle(&s.universe, &s.rule.to_rule_string(), s.rule.states))
}

#[tauri::command]
pub async fn list_presets() -> Result<Presets, String> {
    Ok(PRESETS)
}

// ---------- Bibliothek (portabel gespeichert) ----------

fn library_info(state: &AppState) -> LibraryInfo {
    LibraryInfo {
        library: storage::load(&state.data_dir),
        data_dir: state.data_dir.display().to_string(),
    }
}

#[tauri::command]
pub async fn get_library(state: State<'_, AppState>) -> Result<LibraryInfo, String> {
    Ok(library_info(&state))
}

#[tauri::command]
pub async fn save_rule(
    state: State<'_, AppState>,
    name: String,
    rule: String,
    description: String,
) -> Result<LibraryInfo, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Bitte einen Namen angeben".into());
    }
    let canonical = Rule::parse(&rule)?.to_rule_string();
    let mut lib = storage::load(&state.data_dir);
    lib.rules.retain(|r| r.name != name);
    lib.rules.push(SavedRule {
        name,
        rule: canonical,
        description,
    });
    lib.rules.sort_by_key(|r| r.name.to_lowercase());
    storage::store(&state.data_dir, &lib)?;
    Ok(library_info(&state))
}

#[tauri::command]
pub async fn delete_rule(state: State<'_, AppState>, name: String) -> Result<LibraryInfo, String> {
    let mut lib = storage::load(&state.data_dir);
    lib.rules.retain(|r| r.name != name);
    storage::store(&state.data_dir, &lib)?;
    Ok(library_info(&state))
}

#[tauri::command]
pub async fn save_pattern(
    state: State<'_, AppState>,
    name: String,
    rle: String,
) -> Result<LibraryInfo, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Bitte einen Namen angeben".into());
    }
    parse_rle(&rle)?;
    let mut lib = storage::load(&state.data_dir);
    lib.patterns.retain(|p| p.name != name);
    lib.patterns.push(SavedPattern { name, rle });
    lib.patterns.sort_by_key(|p| p.name.to_lowercase());
    storage::store(&state.data_dir, &lib)?;
    Ok(library_info(&state))
}

#[tauri::command]
pub async fn delete_pattern(
    state: State<'_, AppState>,
    name: String,
) -> Result<LibraryInfo, String> {
    let mut lib = storage::load(&state.data_dir);
    lib.patterns.retain(|p| p.name != name);
    storage::store(&state.data_dir, &lib)?;
    Ok(library_info(&state))
}

// ---------- Dateien (Pfad kommt aus dem nativen Dialog) ----------

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("Datei ist groesser als 50 MB".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
