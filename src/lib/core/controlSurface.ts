/**
 * The control surface: a small HTTP server other machines press buttons at.
 *
 * A Stream Deck on the sound desk talks to Bitfocus Companion, which usually
 * runs on a different box entirely, so "let the operator trigger this remotely"
 * means "listen on a port". The listener itself is Rust (see
 * `src-tauri/src/control.rs` - a webview cannot accept connections); this file is
 * the half that decides what the endpoints *mean*.
 *
 * It is core rather than part of any one module on purpose. Per AGENTS.md a
 * built-in gets no capability a third-party module wouldn't, and "be operable
 * from a Stream Deck" is exactly the kind of thing every module will eventually
 * want. A module registers a handler under its own id and publishes whatever
 * state it wants readable; it never touches the socket.
 *
 * The endpoints, for whoever is configuring Companion:
 *
 *   POST /action/<module>/<rest...>   run an action, e.g. /action/key-changer/key/G
 *   GET  /state                       every module's published state, as one object
 *   GET  /state/<module>              just that module's, so a JSONPath stays short
 *
 * There is no authentication. This listens on a church LAN alongside FreeShow,
 * which has no authentication either, and adding a token here would only move
 * the problem to Companion's config. Do not expose the port to the internet.
 */

import { writable, type Readable } from "svelte/store";

export type ControlAction = {
  /** the path after `/action/<module>/`, already split, e.g. ["key", "G"] */
  path: string[];
  /** the request body parsed as JSON, or null if there wasn't one */
  body: unknown;
};

export type ControlHandler = (action: ControlAction) => void | Promise<void>;

export type ControlServerState = {
  running: boolean;
  port: number;
  /** why the last start attempt failed, or "" */
  error: string;
};

export type ControlSettings = {
  enabled: boolean;
  port: number;
};

const SETTINGS_KEY = "freeshow-utils.control";

/**
 * 5512 keeps the app's own port next to FreeShow's without colliding: FreeShow
 * uses 5505 for the API, 5510 for remote, 5511 for stage and 5513 upward for its
 * other clients, and 5512 is the gap between.
 */
const DEFAULTS: ControlSettings = { enabled: false, port: 5512 };

function loadSettings(): ControlSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const controlSettings = writable<ControlSettings>(loadSettings());

controlSettings.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - the setting just won't survive a restart
  }
});

const serverState = writable<ControlServerState>({
  running: false,
  port: 0,
  error: "",
});
export const controlServer: Readable<ControlServerState> = serverState;

const handlers = new Map<string, ControlHandler>();
const published = new Map<string, Record<string, unknown>>();

let listening = false;

/**
 * Start relaying actions from the Rust listener.
 *
 * Done lazily on first registration rather than at app start, so a build of the
 * app with no module using the control surface never sets any of this up. The
 * import is dynamic because this module is also pulled in during the static
 * build, where `@tauri-apps/api` has no host to talk to.
 */
async function ensureListening() {
  if (listening) return;
  listening = true;

  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<{ path: string; body: string | null }>("control-action", (event) => {
      dispatch(event.payload.path, event.payload.body);
    });
  } catch (error) {
    listening = false;
    serverState.update((state) => ({ ...state, error: String(error) }));
  }
}

/**
 * Route one incoming request to the module that owns it.
 *
 * A path naming a module nobody registered is dropped quietly rather than
 * treated as an error: the likely cause is a Companion button for a module the
 * operator has since removed, and there is nobody at the far end to read a
 * complaint anyway.
 */
function dispatch(rawPath: string, rawBody: string | null) {
  const segments = rawPath.split("/").filter(Boolean);
  const moduleId = segments.shift();
  if (!moduleId) return;

  const handler = handlers.get(moduleId);
  if (!handler) return;

  let body: unknown = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      // a body that isn't JSON is not worth failing over - most buttons send none
      body = rawBody;
    }
  }

  void Promise.resolve(handler({ path: segments, body })).catch(() => {
    // a module throwing must not take the listener down with it
  });
}

/** claim `/action/<moduleId>/…`; returns the undo, for a component's teardown */
export function registerControlModule(moduleId: string, handler: ControlHandler): () => void {
  handlers.set(moduleId, handler);
  void ensureListening();
  return () => {
    if (handlers.get(moduleId) === handler) handlers.delete(moduleId);
  };
}

/**
 * Publish the state a remote surface can read back.
 *
 * This is how a Stream Deck button lights up for the key the song is actually
 * in: Companion polls `/state/<module>` into a variable and a feedback compares
 * it. Call it whenever the value changes; it is cheap, and a stale value on a
 * button is worse than a redundant write.
 */
export function publishControlState(moduleId: string, state: Record<string, unknown>) {
  published.set(moduleId, state);
  void pushState();
}

async function pushState() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_control_state", {
      value: JSON.stringify(Object.fromEntries(published)),
    });
  } catch {
    // the server may simply not be running - state is re-pushed on next change
  }
}

export async function startControlServer(port: number) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("start_control_server", { port });
    serverState.set({ running: true, port, error: "" });
    await pushState();
  } catch (error) {
    serverState.set({ running: false, port, error: String(error) });
  }
}

export async function stopControlServer() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_control_server");
  } catch {
    // already down, which is the state we wanted
  }
  serverState.set({ running: false, port: 0, error: "" });
}
