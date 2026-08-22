import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { writable } from "svelte/store";

export type AppSettings = {
  /** register/deregister the app as an OS login item */
  launchOnStartup: boolean;
  /** close the main window to the tray instead of quitting */
  closeToTray: boolean;
  /** when the OS starts the app at login, leave it in the tray */
  startMinimized: boolean;
};

const DEFAULTS: AppSettings = {
  launchOnStartup: false,
  closeToTray: true,
  startMinimized: false,
};

export const appSettings = writable<AppSettings>(DEFAULTS);
export const appSettingsError = writable("");

/**
 * Every field lives on the Rust side - autostart is an OS-level registration,
 * and the other two have to be
 * readable outside any async command - from the window-close handler and from
 * startup, before there is a webview to ask. This just pulls the values in.
 */
export async function loadAppSettings() {
  try {
    const [launchOnStartup, closeToTray, startMinimized] = await Promise.all([
      isEnabled(),
      invoke<boolean>("get_close_to_tray"),
      invoke<boolean>("get_start_minimized"),
    ]);
    appSettings.set({ launchOnStartup, closeToTray, startMinimized });
  } catch (error) {
    appSettingsError.set(String(error));
  }
}

export async function setLaunchOnStartup(value: boolean) {
  try {
    await (value ? enable() : disable());
    appSettings.update((s) => ({ ...s, launchOnStartup: value }));
  } catch (error) {
    appSettingsError.set(String(error));
  }
}

export async function setCloseToTray(value: boolean) {
  try {
    await invoke("set_close_to_tray", { value });
    appSettings.update((s) => ({ ...s, closeToTray: value }));
  } catch (error) {
    appSettingsError.set(String(error));
  }
}

/**
 * Start into the tray at login.
 *
 * Only a login launch is affected: opening the app yourself always shows the
 * window, because a click that appears to do nothing reads as a broken app.
 */
export async function setStartMinimized(value: boolean) {
  try {
    await invoke("set_start_minimized", { value });
    appSettings.update((s) => ({ ...s, startMinimized: value }));
  } catch (error) {
    appSettingsError.set(String(error));
  }
}
