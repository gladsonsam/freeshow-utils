//! Text Processor backend: discover and run user-supplied Python scripts.

use std::fs;
use std::path::Path;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;

#[tauri::command]
pub async fn execute_python_script(script_path: String, input_text: String) -> Result<String, String> {
    // force UTF-8 stdio, otherwise Windows falls back to a legacy code page
    let mut env = std::env::vars().collect::<std::collections::HashMap<_, _>>();
    env.insert("PYTHONIOENCODING".to_string(), "utf-8".to_string());

    let spawn = |program: &str| {
        Command::new(program)
            .arg(&script_path)
            .envs(&env)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
    };

    let mut child = match spawn("python3") {
        Ok(child) => child,
        Err(_) => spawn("python").map_err(|e| {
            format!(
                "Failed to start Python process (tried 'python3' and 'python'): {}. \
                 Make sure Python is installed and in your PATH.",
                e
            )
        })?,
    };

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

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to read output: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!(
            "Python script error: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[tauri::command]
pub fn list_scripts(folder_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&folder_path);

    if !path.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", folder_path));
    }

    let entries =
        fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut scripts = Vec::new();
    for entry in entries.flatten() {
        let file_path = entry.path();
        if file_path.is_file() && file_path.extension().is_some_and(|ext| ext == "py") {
            scripts.push(file_path.to_string_lossy().to_string());
        }
    }
    scripts.sort();
    Ok(scripts)
}
