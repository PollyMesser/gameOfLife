//! Portable Datenablage.
//!
//! Reihenfolge:
//! 1. Ordner `gameoflife-data` neben der AppImage-Datei (`$APPIMAGE`)
//! 2. Ordner `gameoflife-data` neben der ausfuehrbaren Datei (Windows-portable)
//! 3. Fallback: systemweites App-Datenverzeichnis, falls 1./2. nicht beschreibbar sind

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const DIR_NAME: &str = "gameoflife-data";
const LIBRARY_FILE: &str = "library.json";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRule {
    pub name: String,
    pub rule: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPattern {
    pub name: String,
    pub rle: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    #[serde(default)]
    pub rules: Vec<SavedRule>,
    #[serde(default)]
    pub patterns: Vec<SavedPattern>,
}

fn portable_base() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("APPIMAGE") {
        if let Some(dir) = Path::new(&p).parent() {
            return Some(dir.to_path_buf());
        }
    }
    std::env::current_exe()
        .ok()?
        .parent()
        .map(Path::to_path_buf)
}

fn is_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(probe);
    ok
}

pub fn resolve_data_dir(app: &AppHandle) -> PathBuf {
    if let Some(base) = portable_base() {
        let dir = base.join(DIR_NAME);
        if is_writable(&dir) {
            return dir;
        }
    }
    let fallback = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join(DIR_NAME));
    let _ = fs::create_dir_all(&fallback);
    fallback
}

pub fn load(dir: &Path) -> Library {
    fs::read_to_string(dir.join(LIBRARY_FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Schreibt atomar (tmp + rename), damit eine abgebrochene Speicherung nichts zerstoert.
pub fn store(dir: &Path, lib: &Library) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(lib).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{LIBRARY_FILE}.tmp"));
    fs::write(&tmp, json).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, dir.join(LIBRARY_FILE)).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))
}
