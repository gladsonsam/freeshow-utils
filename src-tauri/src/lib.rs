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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
