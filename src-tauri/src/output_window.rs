//! Putting an output window on the display the user asked for.
//!
//! Setting a window's position is a request the platform is free to ignore, and
//! Wayland ignores it outright — a client there cannot place its own windows, so
//! the `x`/`y` handed to the window builder do nothing and the output lands on
//! whichever monitor the compositor felt like. The one placement Wayland *does*
//! honour is fullscreen against a named output (`xdg_toplevel.set_fullscreen`),
//! which GTK exposes as `gtk_window_fullscreen_on_monitor`.
//!
//! So on Linux the display choice is applied through GTK rather than through the
//! window builder. Everywhere else the builder already places the window
//! correctly, so this command is a no-op for placement - except on Windows,
//! where it also excludes the output from Aero Peek (see the Windows `place`
//! below), which the window builder has no option for.

use serde::{Deserialize, Serialize};

/// Label prefix every stage output window carries. Mirrors `outputLabel` in
/// `outputWindow.ts` and the `output-*` glob in the capability file.
pub const OUTPUT_LABEL_PREFIX: &str = "output-";

/// The display to land on, in logical (scale-adjusted) pixels, which is the same
/// space GDK reports monitor geometry in.
#[derive(Debug, Clone, Deserialize)]
pub struct MonitorTarget {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// What actually happened, so the UI can explain itself instead of silently
/// opening on the wrong screen.
#[derive(Debug, Serialize)]
pub struct Placement {
    /// `"fullscreen-on-monitor"` — pinned to the target display.
    /// `"moved"` — positioned normally.
    /// `"unsupported"` — nothing done here; the caller should use its own path.
    pub strategy: String,
    /// Set when the display choice could not be honoured.
    pub warning: Option<String>,
}

impl Placement {
    fn new(strategy: &str) -> Self {
        Self { strategy: strategy.into(), warning: None }
    }

    fn warn(strategy: &str, warning: String) -> Self {
        Self { strategy: strategy.into(), warning: Some(warning) }
    }
}

#[tauri::command]
pub async fn place_output_window(
    app: tauri::AppHandle,
    label: String,
    target: Option<MonitorTarget>,
    fullscreen: bool,
) -> Result<Placement, String> {
    place(app, label, target, fullscreen)
}

#[cfg(target_os = "macos")]
fn place(
    _app: tauri::AppHandle,
    _label: String,
    _target: Option<MonitorTarget>,
    _fullscreen: bool,
) -> Result<Placement, String> {
    Ok(Placement::new("unsupported"))
}

// Windows honours the window builder's x/y/always-on-top directly, so there is
// no monitor placement to do here. What it won't do on its own is keep the
// output visible through Aero Peek - hovering the "Show desktop" corner (or
// Win+, ) fades every window to an outline to preview the desktop, always-on-top
// or not. DWMWA_EXCLUDED_FROM_PEEK is the documented opt-out other overlay apps
// (subtitle/OSD tools) use for exactly this. It does not affect an actual Show
// Desktop click/Win+D, which minimizes every top-level window regardless of
// z-order - there's no supported way to opt out of that short of intercepting
// WM_SYSCOMMAND, which is a much larger change than this warrants.
#[cfg(target_os = "windows")]
fn place(
    app: tauri::AppHandle,
    label: String,
    _target: Option<MonitorTarget>,
    _fullscreen: bool,
) -> Result<Placement, String> {
    use tauri::Manager;
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_EXCLUDED_FROM_PEEK};

    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no window labelled {label}"))?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;

    let exclude = BOOL(1);
    let result = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_EXCLUDED_FROM_PEEK,
            &exclude as *const BOOL as *const _,
            std::mem::size_of::<BOOL>() as u32,
        )
    };
    if let Err(error) = result {
        return Ok(Placement::warn(
            "unsupported",
            format!("Could not exclude the output from Aero Peek: {error}"),
        ));
    }

    Ok(Placement::new("unsupported"))
}

#[cfg(target_os = "linux")]
fn place(
    app: tauri::AppHandle,
    label: String,
    target: Option<MonitorTarget>,
    fullscreen: bool,
) -> Result<Placement, String> {
    use tauri::Manager;

    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no window labelled {label}"))?;

    // every GTK/GDK call below has to happen on the thread that owns the main
    // loop; commands do not run there
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(place_with_gtk(&window, target, fullscreen));
    })
    .map_err(|error| error.to_string())?;

    rx.recv().map_err(|error| error.to_string())?
}

#[cfg(target_os = "linux")]
fn place_with_gtk(
    window: &tauri::WebviewWindow,
    target: Option<MonitorTarget>,
    fullscreen: bool,
) -> Result<Placement, String> {
    use gtk::prelude::*;

    let gtk_window = window.gtk_window().map_err(|error| error.to_string())?;

    let Some(target) = target else {
        // no display chosen - fullscreen wherever the compositor put it
        if fullscreen {
            gtk_window.fullscreen();
            return Ok(Placement::new("fullscreen-on-monitor"));
        }
        return Ok(Placement::new("moved"));
    };

    let monitor = match monitor_number(&target) {
        Some(monitor) => monitor,
        None => {
            return Ok(Placement::warn(
                "moved",
                "Could not match the chosen display to a connected monitor.".into(),
            ))
        }
    };

    if fullscreen {
        let screen = gtk::prelude::GtkWindowExt::screen(&gtk_window)
            .or_else(gtk::gdk::Screen::default)
            .ok_or_else(|| "no GDK screen available".to_string())?;
        gtk_window.fullscreen_on_monitor(&screen, monitor);
        return Ok(Placement::new("fullscreen-on-monitor"));
    }

    // X11 honours this; Wayland drops it on the floor, which is the whole reason
    // this module exists, so say so rather than opening on the wrong screen
    gtk_window.move_(target.x, target.y);

    if is_wayland() {
        return Ok(Placement::warn(
            "moved",
            "Wayland does not let apps position their own windows. \
             Turn on Fullscreen to send the output to the chosen display."
                .into(),
        ));
    }

    Ok(Placement::new("moved"))
}

/// GDK's monitor list is what `fullscreen_on_monitor` indexes into, and it is not
/// guaranteed to line up with the list the frontend enumerated. Match on geometry
/// first, since that survives re-ordering, and fall back to the index.
#[cfg(target_os = "linux")]
fn monitor_number(target: &MonitorTarget) -> Option<i32> {
    use gtk::prelude::*;

    let display = gtk::gdk::Display::default()?;
    let count = display.n_monitors();

    for number in 0..count {
        let Some(monitor) = display.monitor(number) else { continue };
        let area = monitor.geometry();
        if area.x() == target.x
            && area.y() == target.y
            && area.width() == target.width
            && area.height() == target.height
        {
            return Some(number);
        }
    }

    // geometry didn't match (a scale-factor rounding difference, say) - the
    // origin alone is still a strong signal
    for number in 0..count {
        let Some(monitor) = display.monitor(number) else { continue };
        let area = monitor.geometry();
        if area.x() == target.x && area.y() == target.y {
            return Some(number);
        }
    }

    (target.index < count as usize).then_some(target.index as i32)
}

#[cfg(target_os = "linux")]
fn is_wayland() -> bool {
    match std::env::var("GDK_BACKEND") {
        Ok(backend) if backend.contains("x11") => false,
        _ => std::env::var_os("WAYLAND_DISPLAY").is_some(),
    }
}
