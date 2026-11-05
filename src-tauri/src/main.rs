// Kein Konsolenfenster unter Windows im Release-Build
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    game_of_life_lib::run()
}
