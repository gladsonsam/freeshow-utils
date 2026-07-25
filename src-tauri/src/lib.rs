mod output_window;
mod python;
mod templates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .on_window_event(|window, event| {
            use tauri::Manager;

            // Output windows are borderless and often on a screen the operator
            // isn't looking at, so closing the control window has to take them
            // down too - otherwise the app "quits" and leaves a stage display up
            // with no way left to close it. Done here rather than in the
            // frontend because it has to hold even if the frontend is wedged.
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && window.label() == "main"
            {
                close_output_windows(window.app_handle());
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
