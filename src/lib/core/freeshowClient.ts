import { io, type Socket } from "socket.io-client";
import { get, writable, type Readable, type Writable } from "svelte/store";
import type { Out, Project, Show, StageLayout } from "./types";
import { connectionSettings, type ConnectionSettings } from "./connectionSettings";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "no-hook";

const NO_HOOK_MESSAGE =
  "FreeShow has no Stage Show configured. Create any one (name/output only, contents don't matter) " +
  "under Stage in FreeShow - it's only used as a routing pointer, this app ignores its layout.";

/** how often to re-poll the project list (it only changes when the operator edits it) */
const PROJECTS_REFRESH_MS = 60_000;
const API_TIMEOUT_MS = 10_000;

type Pending = { resolve: (data: any) => void; settled: boolean };

/**
 * The complete set of FreeShow actions this app is allowed to send that change
 * anything. Everything else goes through `request`, which is `get_*` only.
 *
 * This app was read-only for its whole life before transposing arrived, and the
 * reason was never squeamishness - it runs on a machine driving a live service,
 * where a stray `next_slide` is a visible mistake in front of a congregation.
 * Transposing has to write, so the rule became "writes are a short enumerated
 * list" rather than "no writes": an action absent from this list cannot be sent
 * by any module, however it was asked for - including over the control surface,
 * where the caller is a Stream Deck somewhere on the network.
 *
 * Adding to this list is a deliberate act. Think about what it means for someone
 * mid-service before you do.
 */
export const WRITE_ACTIONS = new Set(["transpose_show_up", "transpose_show_down"]);

/**
 * Owns both connections to FreeShow:
 *  - the Stage server (default :5511), a push feed mirroring the live output
 *  - the Companion API (default :5505), plain request/response, the only place
 *    project/playlist data is reachable at all
 *
 * Reading is unrestricted: we subscribe to the feed and issue `get_*` actions
 * freely. Writing is not - it goes through `command`, which will only send an
 * action named in `WRITE_ACTIONS`.
 */
export class FreeShowClient {
  readonly status: Writable<ConnectionStatus> = writable("disconnected");
  readonly errorMessage: Writable<string> = writable("");
  readonly out: Writable<Out | null> = writable(null);
  readonly shows: Writable<Record<string, Show>> = writable({});
  readonly background: Writable<string> = writable("");
  /** same, for the slide one step ahead - FreeShow sends it alongside */
  readonly nextBackground: Writable<string> = writable("");
  readonly projects: Writable<Record<string, Project> | null> = writable(null);

  private stageSocket: Socket | null = null;
  private apiSocket: Socket | null = null;
  private projectsTimer: ReturnType<typeof setInterval> | null = null;

  // The Companion API never echoes back a client-supplied request id, only the
  // action name - so responses are matched FIFO per action rather than by id.
  // A queue (not a single slot) keeps concurrent calls to the same action correct.
  private apiPending = new Map<string, Pending[]>();

  connect(settings?: Partial<ConnectionSettings>) {
    const config: ConnectionSettings = { ...get(connectionSettings), ...settings };
    this.disconnect();
    this.status.set("connecting");
    this.errorMessage.set("");

    this.connectStage(config);
    this.connectApi(config);
  }

  // FreeShow's Stage protocol requires an existing "Stage Show" entry purely to
  // know which output to mirror - it's just a routing pointer. We auto-pick the
  // first one and never touch its item/position data.
  private connectStage(config: ConnectionSettings) {
    const socket = io(`http://${config.host}:${config.stagePort}`, { transports: ["websocket"] });
    this.stageSocket = socket;

    socket.on("connect", () => this.sendStage("LAYOUTS"));

    socket.on("connect_error", (err) => {
      this.status.set("disconnected");
      this.errorMessage.set(
        `Could not reach FreeShow Stage server at ${config.host}:${config.stagePort} (${err.message})`,
      );
    });

    socket.on("disconnect", () => this.status.set("disconnected"));

    socket.on("STAGE", (msg: { channel: string; data: any }) => {
      switch (msg.channel) {
        case "LAYOUTS": {
          const layouts: StageLayout[] = msg.data || [];
          if (!layouts.length) {
            this.status.set("no-hook");
            this.errorMessage.set(NO_HOOK_MESSAGE);
            return;
          }
          this.status.set("connected");
          this.errorMessage.set("");
          this.sendStage("LAYOUT", { id: layouts[0].id });
          break;
        }
        case "OUT":
          this.out.set(msg.data);
          break;
        // Sent with an id but no show whenever the output isn't a show at all -
        // scripture, say. Caching that would put an undefined entry in the map
        // and mask a show that later arrives under the same id.
        case "SHOW_DATA":
          if (msg.data?.id && msg.data.show) {
            this.shows.update((cache) => ({ ...cache, [msg.data.id]: msg.data.show }));
          }
          break;
        // Carries more than its name suggests: the current background *and* the
        // two after it, each already downscaled to a data URI. Non-images come
        // back empty, so this never lands a whole video in memory.
        case "BACKGROUND":
          this.background.set(msg.data?.path || "");
          this.nextBackground.set(msg.data?.next?.path || "");
          break;
        case "ERROR":
          this.errorMessage.set(`FreeShow error: ${JSON.stringify(msg.data)}`);
          break;
      }
    });
  }

  private connectApi(config: ConnectionSettings) {
    const socket = io(`http://${config.host}:${config.apiPort}`, { transports: ["websocket"] });
    this.apiSocket = socket;

    socket.on("data", (msg: { action: string; data: any }) => {
      const queue = this.apiPending.get(msg.action);
      if (!queue) return;
      // drop already-timed-out entries so late responses stay aligned
      let entry = queue.shift();
      while (entry && entry.settled) entry = queue.shift();
      if (!queue.length) this.apiPending.delete(msg.action);
      if (!entry) return;
      entry.settled = true;
      entry.resolve(msg.data);
    });

    socket.on("connect", () => {
      this.fetchProjects();
      if (this.projectsTimer) clearInterval(this.projectsTimer);
      this.projectsTimer = setInterval(() => this.fetchProjects(), PROJECTS_REFRESH_MS);
    });
  }

  /** issue a read-only Companion API action and await its response */
  request(action: string, data?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve) => {
      const socket = this.apiSocket;
      if (!socket?.connected) {
        resolve(null);
        return;
      }

      const entry: Pending = { resolve, settled: false };
      const queue = this.apiPending.get(action);
      if (queue) queue.push(entry);
      else this.apiPending.set(action, [entry]);

      setTimeout(() => {
        if (entry.settled) return;
        entry.settled = true;
        resolve(null);
      }, API_TIMEOUT_MS);

      socket.emit("data", JSON.stringify({ action, ...(data || {}) }));
    });
  }

  /**
   * Send an action that changes FreeShow.
   *
   * Deliberately not part of `request`: these are the calls that edit a real
   * show on a machine running a real service, and they should be impossible to
   * reach for by accident while looking for a getter. The action must be in
   * `WRITE_ACTIONS`.
   *
   * FreeShow acknowledges these by acting on them, not by replying, so there is
   * nothing to await beyond the socket accepting the frame - a caller that needs
   * to know it worked must read the show back and look. `transposeBy` does.
   */
  command(action: string, data?: Record<string, unknown>): { ok: boolean; error: string } {
    if (!WRITE_ACTIONS.has(action)) {
      return { ok: false, error: `"${action}" is not an action this app is allowed to send.` };
    }

    const socket = this.apiSocket;
    if (!socket?.connected) {
      return { ok: false, error: "Not connected to FreeShow." };
    }

    socket.emit("data", JSON.stringify({ action, ...(data || {}) }));
    return { ok: true, error: "" };
  }

  async fetchProjects() {
    const data = await this.request("get_projects");
    if (data) this.projects.set(data);
  }

  disconnect() {
    this.stageSocket?.disconnect();
    this.stageSocket = null;
    this.apiSocket?.disconnect();
    this.apiSocket = null;

    for (const queue of this.apiPending.values()) {
      for (const entry of queue) {
        if (entry.settled) continue;
        entry.settled = true;
        entry.resolve(null);
      }
    }
    this.apiPending.clear();

    if (this.projectsTimer) clearInterval(this.projectsTimer);
    this.projectsTimer = null;

    this.status.set("disconnected");
    this.out.set(null);
    this.shows.set({});
    this.background.set("");
    this.nextBackground.set("");
    this.projects.set(null);
  }

  private sendStage(channel: string, data: any = null) {
    const socket = this.stageSocket;
    if (!socket?.id) return;
    socket.emit("STAGE", { id: socket.id, channel, data });
  }
}

/**
 * The app-wide connection. Each window (main, and every output window) gets its
 * own instance since Tauri webviews are separate JS contexts - which is exactly
 * what we want: output windows stay live independently of the control window.
 */
export const freeshowClient = new FreeShowClient();

export const connectionStatus: Readable<ConnectionStatus> = freeshowClient.status;
