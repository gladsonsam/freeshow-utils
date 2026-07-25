import { writable } from "svelte/store";

export type OutputSettings = {
  /** matched by name first, index second - see resolveDisplay */
  displayName: string | null;
  displayIndex: number;
  fullscreen: boolean;
};

const KEY = "freeshow-utils.stage-output";

const DEFAULTS: OutputSettings = { displayName: null, displayIndex: 0, fullscreen: false };

function load(): OutputSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const outputSettings = writable<OutputSettings>(load());

outputSettings.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - the choice just won't persist
  }
});
