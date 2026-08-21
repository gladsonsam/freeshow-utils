import { invoke } from "@tauri-apps/api/core";
import { getAllWebviewWindows, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, primaryMonitor, type Monitor } from "@tauri-apps/api/window";
import type { TemplateMeta } from "./templates";

/** window label for a template's output window - must match the "output-*" capability glob */
export const outputLabel = (id: string) => `output-${id}`;

export type Display = {
  index: number;
  /** what to put in front of the operator: the monitor's own name, or "Display 2" */
  name: string;
  /**
   * What the monitor calls itself, when the platform knows. `null` when all we
   * were handed is a slot (`\\.\DISPLAY2`) or an X11 handle (`0x403D`), which
   * name a position in a list rather than a screen.
   */
  friendly: string | null;
  /**
   * Unique and stable per physical monitor - Windows' monitor device path. This
   * is the one field worth remembering: everything else about a display can
   * change between one connection and the next.
   */
  identity: string | null;
  /** how it is attached: "wireless", "hdmi", "internal"… `null` where unknown */
  connection: string | null;
  /** logical (scale-adjusted) geometry, which is what window options expect */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1 at 100% Windows scaling, 1.5 at 150%, and so on */
  scale: number;
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

/**
 * The resolution to *show* is the native one.
 *
 * The logical size is the native size divided by the monitor's scale factor, so
 * a 1080p screen at 150% scaling reads as "1280 × 720" - which is not a number
 * anybody recognises their own TV by, and makes a real 720p screen and a scaled
 * 1080p one look like the same thing. Window placement still uses the logical
 * rect; only the label uses this.
 */
export const nativeSize = (display: Display) =>
  `${display.physical.width} × ${display.physical.height}`;

/** "150%", or "" when the monitor is unscaled and there is nothing to explain */
export const scaleNote = (display: Display) =>
  display.scale && display.scale !== 1 ? `${Math.round(display.scale * 100)}%` : "";

/** the short words that tell two otherwise identical screens apart */
export function displayTags(display: Display): string[] {
  const tags: string[] = [];
  if (display.primary) tags.push("primary");
  if (display.connection === "wireless") tags.push("wireless");
  else if (display.connection === "virtual") tags.push("virtual");
  else if (display.connection === "internal") tags.push("built-in");
  return tags;
}

/** "Living Room TV — 1920 × 1080 (wireless)" */
export function displayLabel(display: Display): string {
  const tags = displayTags(display);
  return `${display.name} — ${nativeSize(display)}${tags.length ? ` (${tags.join(", ")})` : ""}`;
}

/** "Living Room TV · 1920×1080", for the cramped per-template picker */
export function shortDisplayLabel(display: Display): string {
  return `${display.name} · ${display.physical.width}×${display.physical.height}`;
}

/**
 * Platforms hand back wildly different monitor names - a real model name on
 * some, a bare handle like "0x403D" on X11/Wayland, and on Windows the GDI slot
 * the monitor happens to occupy (`\\.\DISPLAY2`). Only a real name is worth
 * showing; anything else is an ordinal wearing a costume.
 */
function claimedName(name: string | null): string | null {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return null;
  // \\.\DISPLAY2 - a slot on the graphics adapter, reassigned freely between
  // one connection and the next
  if (/^\\\\[.?]\\DISPLAY\d+$/i.test(trimmed)) return null;
  return trimmed;
}

/** What the backend knows about a monitor that the window runtime does not. */
type DisplayName = {
  device: string;
  friendly: string | null;
  path: string | null;
  connection: string | null;
};

/**
 * Names keyed by the platform monitor name. Empty when the platform has nothing
 * extra to add, or when the backend predates the command - a picker with plain
 * ordinals is a lesser thing, not a broken one.
 */
async function describeDisplays(): Promise<Map<string, DisplayName>> {
  try {
    const described = await invoke<DisplayName[]>("describe_displays");
    return new Map(described.map((entry) => [entry.device, entry]));
  } catch {
    return new Map();
  }
}

function toDisplay(
  monitor: Monitor,
  index: number,
  primary: Monitor | null,
  described: DisplayName | undefined,
): Display {
  const scale = monitor.scaleFactor || 1;
  const friendly = described?.friendly?.trim() || claimedName(monitor.name);
  return {
    index,
    name: friendly ?? `Display ${index + 1}`,
    friendly,
    identity: described?.path || null,
    connection: described?.connection || null,
    x: Math.round(monitor.position.x / scale),
    y: Math.round(monitor.position.y / scale),
    width: Math.round(monitor.size.width / scale),
    height: Math.round(monitor.size.height / scale),
    scale,
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
  const [monitors, primary, described] = await Promise.all([
    availableMonitors(),
    primaryMonitor().catch(() => null),
    describeDisplays(),
  ]);
  return monitors.map((monitor, index) =>
    toDisplay(monitor, index, primary, described.get(monitor.name ?? "")),
  );
}

/**
 * Everything remembered about a chosen display, so it can be found again after
 * it has been unplugged and reconnected.
 *
 * One field is never enough. On Windows the runtime's `name` for a monitor is
 * only the GDI slot it occupies (`\\.\DISPLAY2`), and a wireless display takes
 * whichever slot happens to be free, so both that and the index differ between
 * one connection and the next. `identity` - the monitor's own device path - is
 * the field that actually survives, when the platform gives us one; resolution
 * and desktop position carry the identity when it does not.
 */
export type DisplayRef = {
  /** unique per physical monitor; absent on a choice made before we asked for it */
  identity?: string | null;
  /** the monitor's own name, when it has one - not the slot */
  friendly?: string | null;
  name: string | null;
  index: number;
  /** logical, matching `Display.width`/`height` */
  width: number;
  height: number;
  x: number;
  y: number;
  /** native resolution, so a display that is away can still be named honestly */
  native?: { width: number; height: number } | null;
  connection?: string | null;
};

export const displayRef = (display: Display): DisplayRef => ({
  identity: display.identity,
  friendly: display.friendly,
  name: display.name,
  index: display.index,
  width: display.width,
  height: display.height,
  x: display.x,
  y: display.y,
  native: { width: display.physical.width, height: display.physical.height },
  connection: display.connection,
});

/**
 * Whether a remembered choice predates the richer identity above and would be
 * worth rewriting once its display is in front of us again. Nothing is broken
 * without it; the match just rests on geometry alone.
 */
export const refIsStale = (ref: DisplayRef | null, display: Display | null) =>
  !!ref && !!display && !!display.identity && ref.identity !== display.identity;

/**
 * Whether two snapshots describe the same set of screens *as far as anything on
 * screen is concerned*. Geometry alone isn't it: the monitor names arrive from a
 * second call that can come back empty on one poll and populated on the next,
 * and a picker that never notices would keep showing ordinals forever.
 */
export const sameDisplayList = (a: Display[], b: Display[]) =>
  a.length === b.length &&
  a.every(
    (display, index) =>
      sameDisplay(display, b[index]) &&
      display.name === b[index].name &&
      display.identity === b[index].identity &&
      display.connection === b[index].connection,
  );

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
 * Below the device path, no single signal is trusted alone. The monitor's own
 * name plus anything else clears the bar, and so does resolution together with
 * the same place on the desktop - but nothing weaker. In particular resolution
 * plus index is deliberately *not* enough: a stage TV and a booth monitor are
 * very often both 1920x1080, and a monitor that lands on the index the TV used
 * to hold would otherwise be adopted as the TV. Sending the output to the wrong
 * screen is the exact failure this exists to prevent, so a missed match (which
 * shows as "waiting", and is one click to re-pick) is the far cheaper mistake.
 */
const MATCH_THRESHOLD = 4;

function matchScore(display: Display, ref: DisplayRef): number {
  // A monitor that told us its own device path is identified by it and nothing
  // else needs to agree: it is unique per panel, and it is the same string after
  // the display has been off all week.
  if (ref.identity && display.identity === ref.identity) return 6;

  let score = 0;
  // the monitor's own name - worth a lot, but not decisive on its own, because
  // two of the same model report the same name
  if (ref.friendly && display.friendly === ref.friendly) score += 3;
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
  // native when we recorded it; the logical rect is all an older choice has
  const size = ref.native ?? { width: ref.width, height: ref.height };
  // geometry is -1 on a choice migrated from settings that never recorded it
  if (size.width < 0 || size.height < 0) return name;
  return `${name} · ${size.width}×${size.height}`;
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
  options: { display?: Display | null; fullscreen?: boolean; focus?: boolean } = {},
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
    // A rough first guess only - `fillDisplay` below is what actually places the
    // window. These are logical units, and the runtime resolves them against
    // whichever monitor it thinks the window is being born on, which is exactly
    // the guess that goes wrong on a mixed-DPI desktop.
    x: display?.x,
    y: display?.y,
    width: display?.width ?? 1280,
    height: display?.height ?? 720,
    // Born hidden, shown once it is on the right screen. Otherwise the first
    // frame lands wherever the guess above put it - which on a mixed-DPI desktop
    // is the operator's own monitor, mid-service.
    visible: false,
    // fullscreen is applied after creation instead, so it can be aimed at a
    // specific monitor rather than whichever one the window happened to open on
    fullscreen: false,
    decorations: false,
    resizable: true,
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

  if (display) await fillDisplay(window, display);
  await window.show();
  if (options.focus ?? true) await window.setFocus();

  return applyPlacement(window, label, display, fullscreen);
}

/**
 * Put a window exactly over one display, in device pixels.
 *
 * This is the only correct way to aim a window at a specific monitor, and the
 * reason is worth spelling out, because the obvious way looks like it works.
 *
 * The window builder takes *logical* units. To place them it walks the monitors,
 * converts the requested point using each monitor's own scale factor, and keeps
 * the first monitor whose rect contains the result. Give it a 1080p stage TV at
 * 150% scaling sitting to the right of a 1080p booth monitor at 100%, and the
 * numbers work out like this: the TV's logical origin is 1920 / 1.5 = 1280,
 * which the booth monitor - tried first, and unscaled - happily claims, because
 * 1280 is inside 0..1920. The size goes the same way: the TV's logical size is
 * 1280x720, and applied at the booth monitor's scale that is 1280x720 device
 * pixels on a 1920x1080 screen.
 *
 * So the output opens on the wrong monitor at two-thirds size, and every number
 * involved was one the app itself asked for. Device pixels have none of this
 * ambiguity: they are one coordinate space shared by every monitor.
 *
 * Position first, then size. Crossing a DPI boundary makes Windows rescale the
 * window to suit the monitor it arrived on, so a size set beforehand is a size
 * that gets overwritten on the way.
 */
async function fillDisplay(window: WebviewWindow, display: Display): Promise<void> {
  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
  await window.setPosition(new PhysicalPosition(display.physical.x, display.physical.y));
  await window.setSize(new PhysicalSize(display.physical.width, display.physical.height));
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

  if (await window.isFullscreen()) await window.setFullscreen(false);
  await fillDisplay(window, display);

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
