//! The one app-wide preference that has to be readable from a window-close
//! handler: whether closing the main window should drop it to the tray or quit
//! for real. Kept as its own tiny JSON file rather than pulled into the
//! template storage, since it has nothing to do with templates and is read on
//! a different thread (the window event callback) than any command runs on.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Shared with the window-close handler, which cannot go through the async
/// command/IPC machinery - it needs the current value synchronously.
pub struct AppSettingsState {
    pub close_to_tray: AtomicBool,
}

impl Default for AppSettingsState {
    fn default() -> Self {
        Self { close_to_tray: AtomicBool::new(true) }
    }
}

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    #[serde(default = "default_true")]
    close_to_tray: bool,
}

fn default_true() -> bool {
    true
}

impl Default for SettingsFile {
    fn default() -> Self {
        Self { close_to_tray: true }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve the app data directory: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {}", dir.display(), e))?;
    Ok(dir.join("settings.json"))
}

/// Read the settings file into the shared state at startup. Any problem
/// reading it (missing file, corrupt JSON) just leaves the default in place
/// rather than failing app startup over a preference.
pub fn load(app: &AppHandle) -> AppSettingsState {
    let file = settings_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<SettingsFile>(&raw).ok())
        .unwrap_or_default();

    AppSettingsState { close_to_tray: AtomicBool::new(file.close_to_tray) }
}

#[tauri::command]
pub fn get_close_to_tray(state: tauri::State<AppSettingsState>) -> bool {
    state.close_to_tray.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_close_to_tray(
    app: AppHandle,
    state: tauri::State<AppSettingsState>,
    value: bool,
) -> Result<(), String> {
    state.close_to_tray.store(value, Ordering::Relaxed);

    let path = settings_path(&app)?;
    let contents = serde_json::to_string_pretty(&SettingsFile { close_to_tray: value })
        .map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}
