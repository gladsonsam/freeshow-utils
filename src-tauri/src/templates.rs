//! Stage-template storage.
//!
//! A template is a single self-contained .html file with a leading metadata
//! comment, stored flat in the app data dir. Plain files mean templates are
//! trivially shareable - drop a .html file in the folder and it shows up.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

const HEADER_MARKER: &str = "<!-- freeshow-template";

#[derive(Serialize, Clone)]
pub struct TemplateMeta {
    pub id: String,
    pub name: String,
    pub created: String,
}

#[derive(Serialize, Clone)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub created: String,
    pub html: String,
}

/// Parsed content of an arbitrary .html file being imported.
#[derive(Serialize, Clone)]
pub struct ImportedTemplate {
    pub name: String,
    pub html: String,
}

fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve the app data directory: {}", e))?
        .join("stage-templates");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create {}: {}", dir.display(), e))?;
    Ok(dir)
}

/// Ids double as filenames, so keep them to characters that are safe everywhere.
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Template id must be 1-128 characters".to_string());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Template id may only contain letters, digits, '-' and '_'".to_string());
    }
    Ok(())
}

fn template_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    Ok(templates_dir(app)?.join(format!("{}.html", id)))
}

/// Keep attribute values from breaking out of the HTML comment they live in.
fn sanitize_attr(value: &str) -> String {
    value
        .replace(['\r', '\n'], " ")
        .replace('"', "'")
        .replace("--", "-")
        .replace('>', ")")
        .trim()
        .to_string()
}

fn read_attr(header: &str, key: &str) -> Option<String> {
    let needle = format!("{}=\"", key);
    let start = header.find(&needle)? + needle.len();
    let rest = &header[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Split a stored file into its metadata header and the user's HTML body.
/// Files without a header (hand-dropped or imported) still load fine - they just
/// fall back to defaults.
fn parse(id: &str, contents: &str) -> Template {
    let trimmed = contents.trim_start();
    if trimmed.starts_with(HEADER_MARKER) {
        if let Some(end) = trimmed.find("-->") {
            let header = &trimmed[..end];
            let body = trimmed[end + 3..].trim_start_matches(['\r', '\n']);
            return Template {
                id: read_attr(header, "id").unwrap_or_else(|| id.to_string()),
                name: read_attr(header, "name").unwrap_or_else(|| id.to_string()),
                created: read_attr(header, "created").unwrap_or_default(),
                html: body.to_string(),
            };
        }
    }

    Template {
        id: id.to_string(),
        name: id.to_string(),
        created: String::new(),
        html: contents.to_string(),
    }
}

fn serialize(template: &Template) -> String {
    format!(
        "{} name=\"{}\" id=\"{}\" created=\"{}\" -->\n{}",
        HEADER_MARKER,
        sanitize_attr(&template.name),
        template.id,
        sanitize_attr(&template.created),
        template.html
    )
}

#[tauri::command]
pub fn list_templates(app: AppHandle) -> Result<Vec<TemplateMeta>, String> {
    let dir = templates_dir(&app)?;
    let entries = fs::read_dir(&dir).map_err(|e| format!("Could not read {}: {}", dir.display(), e))?;

    let mut templates = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().is_none_or(|ext| ext != "html") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(stem) => stem.to_string(),
            None => continue,
        };
        // a template that can't be read shouldn't take the whole gallery down
        let Ok(contents) = fs::read_to_string(&path) else { continue };
        let template = parse(&stem, &contents);
        templates.push(TemplateMeta {
            id: template.id,
            name: template.name,
            created: template.created,
        });
    }

    templates.sort_by_key(|a| a.name.to_lowercase());
    Ok(templates)
}

#[tauri::command]
pub fn read_template(app: AppHandle, id: String) -> Result<Template, String> {
    let path = template_path(&app, &id)?;
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Could not read template '{}': {}", id, e))?;
    Ok(parse(&id, &contents))
}

#[tauri::command]
pub fn write_template(
    app: AppHandle,
    id: String,
    name: String,
    created: String,
    html: String,
) -> Result<TemplateMeta, String> {
    let path = template_path(&app, &id)?;
    let template = Template { id, name, created, html };
    fs::write(&path, serialize(&template))
        .map_err(|e| format!("Could not save template: {}", e))?;
    Ok(TemplateMeta {
        id: template.id,
        name: template.name,
        created: template.created,
    })
}

#[tauri::command]
pub fn delete_template(app: AppHandle, id: String) -> Result<(), String> {
    let path = template_path(&app, &id)?;
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path).map_err(|e| format!("Could not delete template: {}", e))
}

/// Read an arbitrary .html file from disk so the caller can save it as a template.
#[tauri::command]
pub fn read_template_file(source_path: String) -> Result<ImportedTemplate, String> {
    let path = PathBuf::from(&source_path);
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {}", source_path, e))?;

    let fallback_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported template")
        .to_string();

    let parsed = parse(&fallback_name, &contents);
    let name = if parsed.name == fallback_name || parsed.name.is_empty() {
        fallback_name
    } else {
        parsed.name
    };

    Ok(ImportedTemplate { name, html: parsed.html })
}

#[tauri::command]
pub fn export_template_file(app: AppHandle, id: String, dest_path: String) -> Result<(), String> {
    let source = template_path(&app, &id)?;
    let contents = fs::read_to_string(&source)
        .map_err(|e| format!("Could not read template '{}': {}", id, e))?;
    fs::write(&dest_path, contents).map_err(|e| format!("Could not write {}: {}", dest_path, e))
}

/// Drop the template-authoring guide next to the templates themselves, so it's
/// there when someone opens the folder.
#[tauri::command]
pub fn write_templates_readme(app: AppHandle, contents: String) -> Result<(), String> {
    let path = templates_dir(&app)?.join("README.md");
    fs::write(&path, contents).map_err(|e| format!("Could not write the template guide: {}", e))
}

#[tauri::command]
pub fn templates_folder(app: AppHandle) -> Result<String, String> {
    Ok(templates_dir(&app)?.to_string_lossy().to_string())
}
