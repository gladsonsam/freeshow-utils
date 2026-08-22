//! The app-wide preferences that have to be readable outside a command: whether
//! closing the main window drops it to the tray or quits for real (read from the
//! window-close handler) and whether a login launch should stay in the tray
//! (read during setup, before any webview exists to ask). Kept as their own tiny
//! JSON file rather than pulled into the template storage, since neither has
//! anything to do with templates.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Shared with the window-close handler, which cannot go through the async
/// command/IPC machinery - it needs the current value synchronously.
pub struct AppSettingsState {
    pub close_to_tray: AtomicBool,
    /// Start into the tray instead of onto the screen, when the OS was the one
    /// doing the starting. Only honoured for a login launch - opening the app
    /// yourself always shows the window, since otherwise the click would look
    /// like nothing happened.
    pub start_minimized: AtomicBool,
}

impl Default for AppSettingsState {
    fn default() -> Self {
        Self { close_to_tray: AtomicBool::new(true), start_minimized: AtomicBool::new(false) }
    }
}

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    #[serde(default = "default_true")]
    close_to_tray: bool,
    #[serde(default)]
    start_minimized: bool,
}

fn default_true() -> bool {
    true
}

impl Default for SettingsFile {
    fn default() -> Self {
        Self { close_to_tray: true, start_minimized: false }
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

    AppSettingsState {
        close_to_tray: AtomicBool::new(file.close_to_tray),
        start_minimized: AtomicBool::new(file.start_minimized),
    }
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
    save(&app, &state)
}

#[tauri::command]
pub fn get_start_minimized(state: tauri::State<AppSettingsState>) -> bool {
    state.start_minimized.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_start_minimized(
    app: AppHandle,
    state: tauri::State<AppSettingsState>,
    value: bool,
) -> Result<(), String> {
    state.start_minimized.store(value, Ordering::Relaxed);
    save(&app, &state)
}

/// Write the whole file out. Both preferences go every time, so setting one
/// cannot quietly drop the other back to its default.
fn save(app: &AppHandle, state: &AppSettingsState) -> Result<(), String> {
    let path = settings_path(app)?;
    let contents = serde_json::to_string_pretty(&SettingsFile {
        close_to_tray: state.close_to_tray.load(Ordering::Relaxed),
        start_minimized: state.start_minimized.load(Ordering::Relaxed),
    })
    .map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())
}
