//! The control surface: a small HTTP server other machines press buttons at.
//!
//! A Stream Deck talks to Bitfocus Companion, and Companion usually runs on a
//! different machine from the one driving the screens - so being operable from
//! the sound desk means accepting connections, which a webview cannot do. This
//! is that listener. It knows nothing about keys, songs or FreeShow: it turns
//! requests into Tauri events and serves back whatever JSON the frontend last
//! published. What any of it *means* is decided in
//! `src/lib/core/controlSurface.ts`.
//!
//! Written directly against tokio rather than pulling in a web framework. The
//! whole surface is three routes with no middleware, no routing table and no
//! state machine, and a dependency that ships its own async runtime assumptions
//! is a poor trade for that.
//!
//! There is no authentication, deliberately - see the note in
//! `controlSurface.ts`. Do not expose the port to the internet.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// Refuse a request whose headers run past this. Nothing legitimate here sends
/// more than a couple of hundred bytes, so anything larger is a mistake or a
/// probe, and neither deserves unbounded memory.
const MAX_HEADER_BYTES: usize = 8 * 1024;

/// The same for a body. Bodies are optional and tiny - a button that sends one
/// at all is sending a flag or two.
const MAX_BODY_BYTES: usize = 64 * 1024;

/// What the frontend gets told when a request arrives.
#[derive(Clone, Serialize)]
struct ActionEvent {
    /// the path after `/action/`, e.g. "key-changer/key/G"
    path: String,
    /// the request body, if there was one
    body: Option<String>,
}

pub struct ControlState {
    /// The JSON the frontend last published, served at `/state`. Shared with
    /// every open connection, so a poll never has to wake the webview.
    published: Arc<Mutex<String>>,
    /// Sending on this stops the running server. `None` when nothing is up.
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
}

impl Default for ControlState {
    fn default() -> Self {
        Self {
            published: Arc::new(Mutex::new("{}".to_string())),
            shutdown: Mutex::new(None),
        }
    }
}

/// Store the JSON served at `/state`.
///
/// Kept even when no server is running, so starting one later immediately serves
/// something true rather than an empty object until the next change.
#[tauri::command]
pub fn set_control_state(state: tauri::State<ControlState>, value: String) {
    if let Ok(mut published) = state.published.lock() {
        *published = value;
    }
}

/// Bind the port and start serving.
///
/// Binding happens here, before returning, so "that port is already taken" comes
/// back as an error the operator can see rather than disappearing into a
/// background task. Starting while already running restarts on the new port.
#[tauri::command]
pub async fn start_control_server(
    app: AppHandle,
    state: tauri::State<'_, ControlState>,
    port: u16,
) -> Result<(), String> {
    stop(&state);

    // 0.0.0.0, not localhost: the entire point is that Companion is on another
    // machine. A listener bound to the loopback would work perfectly on the
    // developer's laptop and be unreachable in the building it is for.
    let listener = TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|error| format!("Could not listen on port {port}: {error}"))?;

    let (sender, mut receiver) = oneshot::channel::<()>();
    if let Ok(mut shutdown) = state.shutdown.lock() {
        *shutdown = Some(sender);
    }

    let published = Arc::clone(&state.published);

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut receiver => break,
                accepted = listener.accept() => {
                    let Ok((stream, _)) = accepted else { continue };
                    let app = app.clone();
                    let published = Arc::clone(&published);
                    // One task per connection, so a client that opens a socket
                    // and then says nothing cannot stall every other button.
                    tauri::async_runtime::spawn(async move {
                        handle(stream, app, published).await;
                    });
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_control_server(state: tauri::State<ControlState>) {
    stop(&state);
}

fn stop(state: &tauri::State<ControlState>) {
    if let Ok(mut shutdown) = state.shutdown.lock() {
        if let Some(sender) = shutdown.take() {
            // The receiver is gone if the task already ended, which is the state
            // being asked for anyway.
            let _ = sender.send(());
        }
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

async fn handle(mut stream: TcpStream, app: AppHandle, published: Arc<Mutex<String>>) {
    let Some((head, body)) = read_request(&mut stream).await else {
        return;
    };

    let mut lines = head.lines();
    let Some(request_line) = lines.next() else {
        return;
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or_default();
    // Query strings are not used by any route, but Companion appends cache
    // busters, so they must not turn a valid path into a 404.
    let path = raw_path.split('?').next().unwrap_or_default();

    // Companion polls from a browser context in some setups, which preflights.
    if method == "OPTIONS" {
        respond(&mut stream, "204 No Content", "text/plain", "").await;
        return;
    }

    if method == "GET" && path == "/state" {
        let value = published
            .lock()
            .map(|state| state.clone())
            .unwrap_or_else(|_| "{}".to_string());
        respond(&mut stream, "200 OK", "application/json", &value).await;
        return;
    }

    // /state/<module> - one module's slice, so a Companion JSONPath can be
    // `$.currentKey` instead of having to quote a hyphenated module name.
    if method == "GET" {
        if let Some(module) = path.strip_prefix("/state/") {
            let whole = published
                .lock()
                .map(|state| state.clone())
                .unwrap_or_else(|_| "{}".to_string());

            let slice = serde_json::from_str::<serde_json::Value>(&whole)
                .ok()
                .and_then(|value| value.get(module).cloned())
                .map(|value| value.to_string())
                .unwrap_or_else(|| "{}".to_string());

            respond(&mut stream, "200 OK", "application/json", &slice).await;
            return;
        }
    }

    if let Some(action) = path.strip_prefix("/action/") {
        if action.is_empty() {
            respond(&mut stream, "404 Not Found", "text/plain", "No action given").await;
            return;
        }

        let event = ActionEvent {
            path: action.to_string(),
            body: if body.is_empty() { None } else { Some(body) },
        };

        // Answered as soon as it is handed over, not once it has been carried
        // out: transposing a song is several round trips to FreeShow, and a
        // Stream Deck should not sit there waiting on that.
        match app.emit("control-action", event) {
            Ok(()) => respond(&mut stream, "202 Accepted", "application/json", "{\"ok\":true}").await,
            Err(error) => {
                let message = format!("{{\"ok\":false,\"error\":\"{error}\"}}");
                respond(&mut stream, "500 Internal Server Error", "application/json", &message).await;
            }
        }
        return;
    }

    if method == "GET" && path == "/" {
        let help = concat!(
            "FreeShow Utils control surface\n\n",
            "POST /action/<module>/<action>   run an action\n",
            "GET  /state                     every module's published state\n",
            "GET  /state/<module>            one module's state\n"
        );
        respond(&mut stream, "200 OK", "text/plain", help).await;
        return;
    }

    respond(&mut stream, "404 Not Found", "text/plain", "Unknown route").await;
}

/// Read one request, returning its head and body as strings.
///
/// Only ever handles a single request per connection - every response says
/// `Connection: close`. Keep-alive would save a negligible amount on a link
/// carrying a button press every few minutes and cost real complexity.
async fn read_request(stream: &mut TcpStream) -> Option<(String, String)> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 1024];

    let header_end = loop {
        match stream.read(&mut chunk).await {
            Ok(0) => return None,
            Ok(count) => {
                buffer.extend_from_slice(&chunk[..count]);
                if let Some(position) = find(&buffer, b"\r\n\r\n") {
                    break position;
                }
                if buffer.len() > MAX_HEADER_BYTES {
                    return None;
                }
            }
            Err(_) => return None,
        }
    };

    let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();

    let length = head
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.trim().eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0)
        .min(MAX_BODY_BYTES);

    let body_start = header_end + 4;
    let mut body = buffer.split_off(body_start.min(buffer.len()));

    while body.len() < length {
        match stream.read(&mut chunk).await {
            Ok(0) => break,
            Ok(count) => body.extend_from_slice(&chunk[..count]),
            Err(_) => break,
        }
    }

    Some((head, String::from_utf8_lossy(&body).to_string()))
}

async fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let length = body.len();
    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {length}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Connection: close\r\n\
         \r\n\
         {body}"
    );

    // Nothing useful to do if the far end has gone: the button was pressed and
    // the work is already under way.
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}
