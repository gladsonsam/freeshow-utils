//! Real names for the connected monitors.
//!
//! The window runtime only ever knows a monitor as the slot Windows filed it
//! under - `\\.\DISPLAY2` - and that slot is neither a name nor stable. A
//! wireless display takes whichever slot is free when it connects, so the same
//! TV is `DISPLAY2` one week and `DISPLAY3` the next, and in a picker two
//! 1080p screens are indistinguishable. Windows does know the monitor's actual
//! name and how it is attached; that just lives behind a different API
//! (`QueryDisplayConfig`) which the runtime never calls.
//!
//! So ask for it here and hand it to the frontend keyed by the slot, which is
//! the one field both lists share. Everywhere else this returns nothing and the
//! frontend falls back to its own naming.

use serde::Serialize;

/// Away from Windows nothing constructs this - the runtime's own monitor name is
/// already the best one going there - but the command still has to have a shape,
/// so the fields are "unread" only in the sense that the platform had nothing to
/// put in them.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
#[derive(Debug, Serialize)]
pub struct DisplayName {
    /// The platform's monitor name, exactly as the window runtime reports it.
    /// This is the join key, not something to show anyone.
    pub device: String,
    /// What the monitor calls itself - "SAMSUNG", "BenQ GW2480", "Living Room TV".
    pub friendly: Option<String>,
    /// The monitor's device path, unique per physical panel-and-port and stable
    /// across reboots. Two identical monitors share a friendly name; they never
    /// share this.
    pub path: Option<String>,
    /// How it is attached: `"wireless"`, `"internal"`, `"hdmi"`, `"displayport"`,
    /// `"dvi"`, `"vga"`, `"virtual"`, or `None` when Windows won't say.
    pub connection: Option<String>,
}

/// Names for every connected monitor, or an empty list on platforms where the
/// runtime's own name is already the best one available.
#[tauri::command]
pub fn describe_displays() -> Vec<DisplayName> {
    describe()
}

#[cfg(not(target_os = "windows"))]
fn describe() -> Vec<DisplayName> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn describe() -> Vec<DisplayName> {
    use windows::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
        DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
        DISPLAYCONFIG_TARGET_DEVICE_NAME,
    };
    use windows::Win32::Foundation::ERROR_SUCCESS;

    let Some(paths) = active_paths() else {
        return Vec::new();
    };

    // One monitor can be driven by several paths (a cloned pair shares a source),
    // so collapse to one entry per slot rather than emitting duplicates the
    // frontend would have to sort out.
    let mut names: Vec<DisplayName> = Vec::new();

    for path in paths {
        let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
        source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
        source.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
        source.header.adapterId = path.sourceInfo.adapterId;
        source.header.id = path.sourceInfo.id;
        if unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } != ERROR_SUCCESS.0 as i32 {
            continue;
        }
        let device = wide_to_string(&source.viewGdiDeviceName);
        if device.is_empty() {
            continue;
        }

        let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
        target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
        target.header.size = std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
        target.header.adapterId = path.targetInfo.adapterId;
        target.header.id = path.targetInfo.id;
        let described =
            unsafe { DisplayConfigGetDeviceInfo(&mut target.header) } == ERROR_SUCCESS.0 as i32;

        let friendly = described
            .then(|| wide_to_string(&target.monitorFriendlyDeviceName))
            .filter(|name| !name.is_empty());
        let path = described
            .then(|| wide_to_string(&target.monitorDevicePath))
            .filter(|path| !path.is_empty());
        let connection = described
            .then(|| connection_kind(target.outputTechnology))
            .flatten();

        match names.iter_mut().find(|existing| existing.device == device) {
            // a cloned pair: keep the first name, but let "wireless" win, since
            // that is the thing the operator is looking for in the list
            Some(existing) => {
                if existing.friendly.is_none() {
                    existing.friendly = friendly;
                }
                if existing.path.is_none() {
                    existing.path = path;
                }
                if connection.as_deref() == Some("wireless") {
                    existing.connection = connection;
                }
            }
            None => names.push(DisplayName {
                device,
                friendly,
                path,
                connection,
            }),
        }
    }

    names
}

/// Every active display path, or `None` if Windows would not describe them.
///
/// The buffer sizes are a snapshot: a display connecting between the two calls
/// makes the second one fail with `ERROR_INSUFFICIENT_BUFFER`, which matters
/// here precisely because this is polled while a wireless display is being
/// connected. Retry a couple of times rather than reporting no monitors at all.
#[cfg(target_os = "windows")]
fn active_paths() -> Option<Vec<windows::Win32::Devices::Display::DISPLAYCONFIG_PATH_INFO>> {
    use windows::Win32::Devices::Display::{
        GetDisplayConfigBufferSizes, QueryDisplayConfig, DISPLAYCONFIG_MODE_INFO,
        DISPLAYCONFIG_PATH_INFO, QDC_ONLY_ACTIVE_PATHS,
    };
    use windows::Win32::Foundation::ERROR_SUCCESS;

    for _ in 0..3 {
        let mut path_count = 0u32;
        let mut mode_count = 0u32;
        let sized = unsafe {
            GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
        };
        if sized != ERROR_SUCCESS {
            return None;
        }

        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
        let queried = unsafe {
            QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                &mut path_count,
                paths.as_mut_ptr(),
                &mut mode_count,
                modes.as_mut_ptr(),
                None,
            )
        };
        if queried == ERROR_SUCCESS {
            paths.truncate(path_count as usize);
            return Some(paths);
        }
        // anything other than "the layout changed under us" is not going to fix
        // itself on a retry
        if queried != windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER {
            return None;
        }
    }

    None
}

/// The connector, reduced to the handful of words worth showing an operator.
/// The distinction that actually earns its place is wireless vs. not.
#[cfg(target_os = "windows")]
fn connection_kind(
    technology: windows::Win32::Devices::Display::DISPLAYCONFIG_VIDEO_OUTPUT_TECHNOLOGY,
) -> Option<String> {
    use windows::Win32::Devices::Display::*;

    let kind = match technology {
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_MIRACAST => "wireless",
        // a wireless dock or a virtual-display driver: not Miracast, but still
        // not something with a cable the operator can trace
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INDIRECT_WIRED
        | DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INDIRECT_VIRTUAL => "virtual",
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL
        | DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED => "internal",
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_HDMI => "hdmi",
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EXTERNAL => "displayport",
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DVI => "dvi",
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_HD15 => "vga",
        _ => return None,
    };
    Some(kind.into())
}

/// A fixed-width UTF-16 field, up to its first NUL.
#[cfg(target_os = "windows")]
fn wide_to_string(field: &[u16]) -> String {
    let end = field.iter().position(|&c| c == 0).unwrap_or(field.len());
    String::from_utf16_lossy(&field[..end]).trim().to_string()
}
