import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { writable } from "svelte/store";

export type AppSettings = {
  /** register/deregister the app as an OS login item */
  launchOnStartup: boolean;
  /** close the main window to the tray instead of quitting */
  closeToTray: boolean;
};

const DEFAULTS: AppSettings = { launchOnStartup: false, closeToTray: true };

export const appSettings = writable<AppSettings>(DEFAULTS);
export const appSettingsError = writable("");

/**
 * Both fields live on the Rust side - autostart is an OS-level registration,
 * and close-to-tray has to be readable from the window-close handler, which
 * runs outside any async command. This just pulls the current values in.
 */
export async function loadAppSettings() {
  try {
    const [launchOnStartup, closeToTray] = await Promise.all([
      isEnabled(),
      invoke<boolean>("get_close_to_tray"),
    ]);
    appSettings.set({ launchOnStartup, closeToTray });
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
