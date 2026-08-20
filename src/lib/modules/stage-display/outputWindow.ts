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
  /**
   * Raw device pixels, kept alongside the logical geometry because the two are
   * not interchangeable on a mixed-DPI desktop: each monitor's logical rect is
   * divided by *its own* scale factor, so logical coordinates from different
   * monitors don't share a coordinate space and can't be compared. Physical
   * ones do. Anything positioning a window across monitors uses these.
   */
  physical: { x: number; y: number; width: number; height: number };
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
    physical: {
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    },
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
 * Everything remembered about a chosen display, so it can be found again after
 * it has been unplugged and reconnected.
 *
 * One field is never enough. On Windows a monitor's `name` is its GDI slot
 * (`\.\DISPLAY2`), and a wireless display takes whichever slot happens to be
 * free, so both the name and the index can differ between one connection and
 * the next. Resolution and desktop position survive a reconnect - Windows
 * remembers the arrangement per display - so they carry the identity when the
 * name has moved.
 */
export type DisplayRef = {
  name: string | null;
  index: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

export const displayRef = (display: Display): DisplayRef => ({
  name: display.name,
  index: display.index,
  width: display.width,
  height: display.height,
  x: display.x,
  y: display.y,
});

export const sameDisplay = (a: Display | null, b: Display | null) =>
  !!a &&
  !!b &&
  a.physical.x === b.physical.x &&
  a.physical.y === b.physical.y &&
  a.physical.width === b.physical.width &&
  a.physical.height === b.physical.height;

/**
 * How strongly a live display looks like the remembered one.
 *
 * Weighted so that a name match alone is enough, and so is resolution together
 * with the same place on the desktop - but nothing weaker. In particular
 * resolution plus index is deliberately *not* enough: a stage TV and a booth
 * monitor are very often both 1920x1080, and a monitor that lands on the index
 * the TV used to hold would otherwise be adopted as the TV. Sending the output
 * to the wrong screen is the exact failure this exists to prevent, so a missed
 * match (which shows as "waiting", and is one click to re-pick) is the far
 * cheaper mistake.
 */
const MATCH_THRESHOLD = 4;

function matchScore(display: Display, ref: DisplayRef): number {
  let score = 0;
  if (ref.name && display.name === ref.name) score += 4;
  if (display.width === ref.width && display.height === ref.height) score += 2;
  if (display.x === ref.x && display.y === ref.y) score += 2;
  // a tiebreak only - never enough on its own to lift a weaker signal over the line
  if (display.index === ref.index) score += 1;
  return score;
}

/**
 * Find a remembered display in the current list, or `null` when it is not
 * connected right now.
 *
 * Returning `null` is the point. Falling back to "some other display" is how an
 * output ends up on the booth monitor while the app reports it went to the
 * stage TV, and the operator drags the window across by hand every week.
 */
export function matchDisplay(displays: Display[], ref: DisplayRef | null): Display | null {
  if (!ref) return null;

  let best: Display | null = null;
  let bestScore = 0;
  for (const display of displays) {
    const score = matchScore(display, ref);
    if (score > bestScore) {
      best = display;
      bestScore = score;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null;
}

/** How a remembered display should be named when it is not connected. */
export function refLabel(ref: DisplayRef | null): string {
  if (!ref) return "the chosen display";
  const name = ref.name || `Display ${ref.index + 1}`;
  // geometry is -1 on a choice migrated from settings that never recorded it
  if (ref.width < 0 || ref.height < 0) return name;
  return `${name} · ${ref.width}×${ref.height}`;
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
    // this is a stage monitor mirroring lyrics, not something the operator
    // alt-tabs to - each one showing up as its own taskbar entry just spams
    // the taskbar, especially with several running at once
    skipTaskbar: true,
    // it's a monitor the congregation/stage is looking at continuously - it
    // must not get buried behind whatever the operator clicks on next
    alwaysOnTop: true,
  });

  await new Promise<void>((resolve, reject) => {
    window.once("tauri://created", () => resolve());
    window.once("tauri://error", (event) => reject(new Error(String(event.payload))));
  });

  return applyPlacement(window, label, display, fullscreen);
}

/**
 * Which display an already-open output is actually sitting on, or `null` if it
 * has no window up. Used to notice that an output opened on the booth monitor
 * because the stage TV was not connected at the time.
 */
export async function outputDisplay(
  templateId: string,
  displays: Display[],
): Promise<Display | null> {
  const window = await WebviewWindow.getByLabel(outputLabel(templateId));
  if (!window) return null;

  try {
    // physical, so the comparison holds on a mixed-DPI desktop
    const { x, y } = await window.outerPosition();
    // the display whose rect contains the window's top-left corner
    return (
      displays.find(
        ({ physical: p }) =>
          x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Send an output that is already up to a different display. This is what runs
 * when a wireless stage display finally connects after the output has already
 * opened somewhere else - the alternative is asking the operator to close it
 * and reopen it, which is the drag-the-window-across problem with extra steps.
 *
 * Fullscreen has to come off first: a fullscreen window is pinned to the
 * monitor it is fullscreen *on*, so moving it while fullscreen does nothing.
 */
export async function moveOutputWindow(
  templateId: string,
  display: Display,
  fullscreen: boolean,
): Promise<string | null> {
  const label = outputLabel(templateId);
  const window = await WebviewWindow.getByLabel(label);
  if (!window) return null;

  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");

  if (await window.isFullscreen()) await window.setFullscreen(false);
  // physical: a logical size would be scaled by the monitor the window is
  // leaving, not the one it is arriving on, and land the wrong size
  await window.setSize(new PhysicalSize(display.physical.width, display.physical.height));
  await window.setPosition(new PhysicalPosition(display.physical.x, display.physical.y));

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
