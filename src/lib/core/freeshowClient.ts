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
 * Owns both connections to FreeShow:
 *  - the Stage server (default :5511), a push feed mirroring the live output
 *  - the Companion API (default :5505), plain request/response, the only place
 *    project/playlist data is reachable at all
 *
 * Read-only by design: we subscribe and issue `get_*` actions, never anything
 * that would control or mutate FreeShow.
 */
export class FreeShowClient {
  readonly status: Writable<ConnectionStatus> = writable("disconnected");
  readonly errorMessage: Writable<string> = writable("");
  readonly out: Writable<Out | null> = writable(null);
  readonly shows: Writable<Record<string, Show>> = writable({});
  readonly background: Writable<string> = writable("");
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
        case "SHOW_DATA":
          if (msg.data?.id) {
            this.shows.update((cache) => ({ ...cache, [msg.data.id]: msg.data.show }));
          }
          break;
        case "BACKGROUND":
          this.background.set(msg.data?.path || "");
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
