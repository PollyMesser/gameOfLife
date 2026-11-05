mod commands;
mod storage;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = storage::resolve_data_dir(app.handle());
            app.manage(AppState::new(data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_frame,
            commands::step,
            commands::new_universe,
            commands::resize_universe,
            commands::set_wrap,
            commands::clear,
            commands::randomize,
            commands::set_cells,
            commands::get_rule,
            commands::parse_rule,
            commands::apply_rule,
            commands::apply_rule_string,
            commands::parse_pattern,
            commands::export_rle,
            commands::list_presets,
            commands::get_library,
            commands::save_rule,
            commands::delete_rule,
            commands::save_pattern,
            commands::delete_pattern,
            commands::read_text_file,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
