mod control;
mod displays;
mod output_window;
mod python;
mod settings;
mod templates;

use std::sync::atomic::Ordering;

/// Passed to the app by the login item it registers for itself, so that a launch
/// the OS did can be told apart from one the operator did.
const AUTOSTART_FLAG: &str = "--minimized";

fn launched_by_login() -> bool {
    std::env::args().any(|argument| argument == AUTOSTART_FLAG)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, per the plugin's own instructions. A second copy of the app
        // would fight the first for the control surface's port and lose, so a
        // relaunch while the original sits in the tray just raises that window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // The login item is registered with a flag the app can see, so
        // "start minimised" can apply to a launch the OS did without also
        // swallowing the window when the operator opens the app themselves.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .invoke_handler(tauri::generate_handler![
            python::execute_python_script,
            python::list_scripts,
            templates::list_templates,
            templates::read_template,
            templates::write_template,
            templates::delete_template,
            templates::read_template_file,
            templates::export_template_file,
            templates::write_templates_readme,
            templates::templates_folder,
            output_window::place_output_window,
            displays::describe_displays,
            settings::get_close_to_tray,
            settings::set_close_to_tray,
            settings::get_start_minimized,
            settings::set_start_minimized,
            control::start_control_server,
            control::stop_control_server,
            control::set_control_state,
        ])
        .setup(|app| {
            use tauri::Manager;
            use tauri_plugin_autostart::ManagerExt;

            let handle = app.handle().clone();
            let settings = settings::load(&handle);
            let stay_hidden =
                launched_by_login() && settings.start_minimized.load(Ordering::Relaxed);
            app.manage(settings);
            app.manage(control::ControlState::default());
            build_tray(&handle)?;

            // Rewrite an existing login item so that it carries the flag above.
            // Earlier versions registered it without one, and without it a
            // login launch cannot be told apart from a deliberate one.
            let autostart = handle.autolaunch();
            if autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.disable();
                let _ = autostart.enable();
            }

            // The window is created hidden (see tauri.conf.json) and shown here
            // rather than created visible and hidden a moment later: hiding it
            // after the fact flashes it onto the screen first.
            if !stay_hidden {
                show_main(&handle);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;

            // Closing the main window drops it to the system tray instead of
            // quitting, unless the operator has turned that off in Settings - a
            // stage display run from a laptop needs to survive the operator
            // dismissing the control window, but not everyone wants a
            // background process left running. Output windows are left alone
            // either way; real quitting (and tearing them down) only happens
            // through the tray menu or this fallback path.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let app = window.app_handle();
                    let close_to_tray = app
                        .state::<settings::AppSettingsState>()
                        .close_to_tray
                        .load(Ordering::Relaxed);

                    if close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        close_output_windows(app);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Tear down every stage output. `destroy` rather than `close` on purpose: a
/// close can be vetoed, and a window nobody can reach must not get a vote.
fn close_output_windows(app: &tauri::AppHandle) {
    use tauri::Manager;

    for (label, window) in app.webview_windows() {
        if label.starts_with(output_window::OUTPUT_LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
}

/// The main window hides instead of closing, so a tray icon is the only way
/// left to bring it back or quit for real.
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let show = MenuItem::with_id(app, "show", "Show FreeShow Utils", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("app has a default icon"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quit" => {
                close_output_windows(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main(app: &tauri::AppHandle) {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
