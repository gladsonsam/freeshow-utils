import { invoke } from "@tauri-apps/api/core";
import { getAllWebviewWindows, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, primaryMonitor, type Monitor } from "@tauri-apps/api/window";
import type { TemplateMeta } from "./templates";

/** window label for a template's output window - must match the "output-*" capability glob */
export const outputLabel = (id: string) => `output-${id}`;

export type Display = {
  index: number;
  name: string;
  /** logical (scale-adjusted) geometry, which is what window options expect */
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
};

/** "Display 1 — 1920 × 1080" */
export function displayLabel(display: Display): string {
  return `${display.name} — ${display.width} × ${display.height}${display.primary ? " (primary)" : ""}`;
}

/** "Display 1 · 1920×1080", for the cramped per-template picker */
export function shortDisplayLabel(display: Display): string {
  return `${display.name} · ${display.width}×${display.height}`;
}

/**
 * Platforms hand back wildly different monitor names - a real model name on
 * some, a bare handle like "0x403D" on X11/Wayland. Anything that isn't
 * recognisably a name gets a plain ordinal instead.
 */
function readableName(name: string | null, index: number): string {
  const trimmed = (name || "").trim();
  const isHandle = !trimmed || /^0x[0-9a-f]+$/i.test(trimmed) || /^\d+$/.test(trimmed);
  return isHandle ? `Display ${index + 1}` : trimmed;
}

function toDisplay(monitor: Monitor, index: number, primary: Monitor | null): Display {
  const scale = monitor.scaleFactor || 1;
  return {
    index,
    name: readableName(monitor.name, index),
    x: Math.round(monitor.position.x / scale),
    y: Math.round(monitor.position.y / scale),
    width: Math.round(monitor.size.width / scale),
    height: Math.round(monitor.size.height / scale),
    // a multi-monitor layout doesn't have to put anything at the origin, so ask
    // the platform which display is primary rather than guessing from position
    primary:
      !!primary &&
      primary.position.x === monitor.position.x &&
      primary.position.y === monitor.position.y,
  };
}

export async function listDisplays(): Promise<Display[]> {
  const [monitors, primary] = await Promise.all([
    availableMonitors(),
    primaryMonitor().catch(() => null),
  ]);
  return monitors.map((monitor, index) => toDisplay(monitor, index, primary));
}

/**
 * Match a saved selection back to a live display. Names are matched first so a
 * selection survives monitors being re-ordered; index is the fallback for
 * unnamed displays.
 */
export function resolveDisplay(displays: Display[], name: string | null, index: number) {
  return displays.find((d) => name && d.name === name) ?? displays[index] ?? displays[0] ?? null;
}

/**
 * Which templates currently have an output window up. Several run at once on a
 * multi-monitor stage, so this is the source of truth for the gallery rather
 * than anything the gallery tracks itself - output windows can also be closed
 * from the keyboard, or fail to open at all.
 */
export async function listOpenOutputs(): Promise<Set<string>> {
  const prefix = outputLabel("");
  const windows = await getAllWebviewWindows();
  return new Set(
    windows
      .filter((window) => window.label.startsWith(prefix))
      .map((window) => window.label.slice(prefix.length)),
  );
}

/** Close one template's output window. Closing one that isn't open is a no-op. */
export async function closeOutputWindow(templateId: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel(outputLabel(templateId));
  await existing?.close();
}

/** what the backend managed to do about the display choice */
type Placement = {
  strategy: "fullscreen-on-monitor" | "moved" | "unsupported";
  warning: string | null;
};

/**
 * Open (or focus) a borderless window rendering one template, filling the chosen
 * display. It opens its own FreeShow connection, so it keeps updating
 * independently of the control window.
 *
 * Returns a warning when the display choice could not be honoured — on Wayland a
 * client may not position its own windows, so only fullscreen output can be sent
 * to a specific display.
 */
export async function openOutputWindow(
  template: TemplateMeta,
  options: { display?: Display | null; fullscreen?: boolean } = {},
): Promise<string | null> {
  const label = outputLabel(template.id);
  const fullscreen = options.fullscreen ?? false;

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return null;
  }

  const display = options.display ?? null;

  const window = new WebviewWindow(label, {
    url: `/output/?template=${encodeURIComponent(template.id)}`,
    title: `${template.name} — Stage Output`,
    // a positioning *request*: honoured on Windows, macOS and X11, dropped on
    // Wayland, which is why placement is re-applied below
    x: display?.x,
    y: display?.y,
    width: display?.width ?? 1280,
    height: display?.height ?? 720,
    // fullscreen is applied after creation instead, so it can be aimed at a
    // specific monitor rather than whichever one the window happened to open on
    fullscreen: false,
    decorations: false,
    resizable: true,
    focus: true,
  });

  await new Promise<void>((resolve, reject) => {
    window.once("tauri://created", () => resolve());
    window.once("tauri://error", (event) => reject(new Error(String(event.payload))));
  });

  return applyPlacement(window, label, display, fullscreen);
}

/**
 * Ask the backend to pin the window to the chosen display. On platforms where
 * the window builder already got it right this reports back as unsupported and
 * fullscreen is applied the ordinary way.
 */
async function applyPlacement(
  window: WebviewWindow,
  label: string,
  display: Display | null,
  fullscreen: boolean,
): Promise<string | null> {
  let placement: Placement;
  try {
    placement = await invoke<Placement>("place_output_window", {
      label,
      fullscreen,
      target: display && {
        index: display.index,
        x: display.x,
        y: display.y,
        width: display.width,
        height: display.height,
      },
    });
  } catch {
    // never let a placement problem leave the operator without an output
    placement = { strategy: "unsupported", warning: null };
  }

  if (placement.strategy === "unsupported" && fullscreen) {
    await window.setFullscreen(true);
  }

  return placement.warning;
}
