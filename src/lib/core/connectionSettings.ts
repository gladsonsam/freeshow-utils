import { writable } from "svelte/store";

export type ConnectionSettings = {
  host: string;
  /** FreeShow Stage server - the live output mirror feed */
  stagePort: string;
  /** FreeShow Companion/REST API - request/response, used for project data */
  apiPort: string;
  autoConnect: boolean;
};

const KEY = "freeshow-utils.connection";

const DEFAULTS: ConnectionSettings = {
  host: "localhost",
  stagePort: "5511",
  apiPort: "5505",
  autoConnect: true,
};

function load(): ConnectionSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const connectionSettings = writable<ConnectionSettings>(load());

connectionSettings.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc.) - settings just won't persist
  }
});
