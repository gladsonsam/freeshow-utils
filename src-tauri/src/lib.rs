// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tokio::process::Command;
use tokio::io::AsyncWriteExt;

#[tauri::command]
async fn execute_python_script(script_path: String, input_text: String) -> Result<String, String> {
    // Set environment variable to force UTF-8 encoding on Windows
    let mut env = std::env::vars().collect::<std::collections::HashMap<_, _>>();
    env.insert("PYTHONIOENCODING".to_string(), "utf-8".to_string());
    
    // Try python3 first, fallback to python
    let child = Command::new("python3")
        .arg(&script_path)
        .envs(&env)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(_) => {
            // Try python as fallback
            Command::new("python")
                .arg(&script_path)
                .envs(&env)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| {
                    format!(
                        "Failed to start Python process (tried 'python3' and 'python'): {}. Make sure Python is installed and in your PATH.",
                        e
                    )
                })?
        }
    };

    // Write input text to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input_text.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
    }

    // Wait for the process to complete and get output
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to read output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Python script error: {}", error_msg))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![execute_python_script])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
