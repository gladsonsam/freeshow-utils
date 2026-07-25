import { writable } from "svelte/store";

export type OutputSettings = {
  /** matched by name first, index second - see resolveDisplay */
  displayName: string | null;
  displayIndex: number;
  fullscreen: boolean;
  /** reopen this template's output on its saved display as soon as the app starts */
  autoStart: boolean;
};

/**
 * Output settings are per template, because a real stage setup runs several at
 * once - lyrics on the foldback screen, a clock in the sound booth, notes on the
 * pastor's monitor. A single global "output display" can only describe one of
 * them.
 *
 * `fallback` seeds a template the first time it is seen, and follows the last
 * choice made anywhere so a newly created template lands somewhere sensible.
 * It is only ever a starting point: `ensureSettings` gives every known template
 * an entry of its own, so changing one screen never drags the others with it.
 */
export type OutputConfig = {
  fallback: OutputSettings;
  byTemplate: Record<string, OutputSettings>;
};

const KEY = "freeshow-utils.stage-output";

// fullscreen by default: an output window is for a stage monitor, and on Wayland
// it is also the only way the chosen display is honoured at all
const DEFAULTS: OutputSettings = {
  displayName: null,
  displayIndex: 0,
  fullscreen: true,
  autoStart: false,
};

const empty = (): OutputConfig => ({ fallback: { ...DEFAULTS }, byTemplate: {} });

function load(): OutputConfig {
  if (typeof localStorage === "undefined") return empty();

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();

    // the previous shape was one flat OutputSettings for the whole module; keep
    // that choice as the fallback rather than dropping it
    if (!("byTemplate" in parsed)) {
      return { fallback: { ...DEFAULTS, ...parsed }, byTemplate: {} };
    }

    const byTemplate: Record<string, OutputSettings> = {};
    for (const [id, settings] of Object.entries(parsed.byTemplate ?? {})) {
      byTemplate[id] = { ...DEFAULTS, ...(settings as Partial<OutputSettings>) };
    }

    return {
      fallback: { ...DEFAULTS, ...(parsed.fallback ?? {}) },
      byTemplate,
    };
  } catch {
    return empty();
  }
}

export const outputConfig = writable<OutputConfig>(load());

outputConfig.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - the choice just won't persist
  }
});

/** the settings a template should use, falling back to the last choice made */
export function settingsFor(config: OutputConfig, templateId: string): OutputSettings {
  return config.byTemplate[templateId] ?? config.fallback;
}

/**
 * Pin down the settings of every template that doesn't have its own entry yet.
 * Until a template is pinned it reads `fallback`, which means it would follow
 * along every time another template's display changed.
 */
export function ensureSettings(templateIds: string[]) {
  outputConfig.update((config) => {
    const missing = templateIds.filter((id) => !(id in config.byTemplate));
    if (!missing.length) return config;

    const byTemplate = { ...config.byTemplate };
    for (const id of missing) byTemplate[id] = { ...config.fallback };
    return { ...config, byTemplate };
  });
}

/** record a change for one template, and make it the starting point for the next */
export function updateSettings(templateId: string, patch: Partial<OutputSettings>) {
  outputConfig.update((config) => {
    const next = { ...settingsFor(config, templateId), ...patch };
    // fallback only seeds templates that have never been seen - every template
    // already in byTemplate keeps whatever it was set to
    return { fallback: next, byTemplate: { ...config.byTemplate, [templateId]: next } };
  });
}

/** drop settings for a template that no longer exists */
export function forgetSettings(templateId: string) {
  outputConfig.update((config) => {
    const { [templateId]: _removed, ...byTemplate } = config.byTemplate;
    return { ...config, byTemplate };
  });
}
