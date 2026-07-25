import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, type Monitor } from "@tauri-apps/api/window";
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

function toDisplay(monitor: Monitor, index: number): Display {
  const scale = monitor.scaleFactor || 1;
  return {
    index,
    name: monitor.name || `Display ${index + 1}`,
    x: Math.round(monitor.position.x / scale),
    y: Math.round(monitor.position.y / scale),
    width: Math.round(monitor.size.width / scale),
    height: Math.round(monitor.size.height / scale),
    // the monitor at the origin is the primary one on every platform we target
    primary: monitor.position.x === 0 && monitor.position.y === 0,
  };
}

export async function listDisplays(): Promise<Display[]> {
  return (await availableMonitors()).map(toDisplay);
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
 * Open (or focus) a borderless window rendering one template, filling the chosen
 * display. It opens its own FreeShow connection, so it keeps updating
 * independently of the control window.
 */
export async function openOutputWindow(
  template: TemplateMeta,
  options: { display?: Display | null; fullscreen?: boolean } = {},
): Promise<void> {
  const label = outputLabel(template.id);

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const display = options.display ?? null;

  const window = new WebviewWindow(label, {
    url: `/output/?template=${encodeURIComponent(template.id)}`,
    title: `${template.name} — Stage Output`,
    // position first, size second: the window has to land on the target display
    // before fullscreen has anything to expand into
    x: display?.x,
    y: display?.y,
    width: display?.width ?? 1280,
    height: display?.height ?? 720,
    fullscreen: options.fullscreen ?? false,
    decorations: false,
    resizable: true,
    focus: true,
  });

  await new Promise<void>((resolve, reject) => {
    window.once("tauri://created", () => resolve());
    window.once("tauri://error", (event) => reject(new Error(String(event.payload))));
  });
}
