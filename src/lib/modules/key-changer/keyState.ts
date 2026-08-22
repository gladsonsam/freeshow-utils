/**
 * Which song the Key Changer is pointed at, what key it is in, and moving it.
 *
 * The actual transposition is FreeShow's: `transpose_show_up` and
 * `transpose_show_down` each move a whole show by one semitone and rewrite the
 * show file, so the change lands on the main output, every stage screen and
 * every other connected device at once. What this file adds is the part the API
 * has no concept of - *absolute* keys. "Put this song in G" means working out
 * what key it is in now, and turning the difference into the right number of
 * one-semitone steps in the right direction.
 */

import { get, writable, type Readable } from "svelte/store";
import { freeshowClient } from "$lib/core/freeshowClient";
import { detectKey, semitoneDelta, type DetectedKey } from "$lib/core/chords";
import { TEMP_SLIDE_ID, type Show } from "$lib/core/types";

/** how long to wait between one-semitone steps, so FreeShow applies them in order */
const STEP_DELAY_MS = 120;

/** how long to give FreeShow to finish writing before reading the show back */
const SETTLE_MS = 250;

export type KeyTarget = {
  showId: string;
  showName: string;
  show: Show;
  key: DetectedKey | null;
  /**
   * The key this show was in when the app first saw it, so "put it back" stays
   * available after any number of transposes. Remembered per show across
   * restarts - a song transposed on Thursday should still offer its original key
   * on Sunday.
   */
  originalKey: { pitch: number; minor: boolean } | null;
};

export type KeyChangerState = {
  target: KeyTarget | null;
  /** a transpose is in flight - the grid disables itself rather than queue presses */
  busy: boolean;
  /** what is happening, for the operator, e.g. "Moving to G…" */
  activity: string;
  error: string;
};

const EMPTY: KeyChangerState = {
  target: null,
  busy: false,
  activity: "",
  error: "",
};

const state = writable<KeyChangerState>(EMPTY);
export const keyChangerState: Readable<KeyChangerState> = state;

// ── Original-key memory ───────────────────────────────────────────────────────

const ORIGINALS_KEY = "freeshow-utils.key-changer.originals";

type Originals = Record<string, { pitch: number; minor: boolean }>;

function loadOriginals(): Originals {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ORIGINALS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOriginals(originals: Originals) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ORIGINALS_KEY, JSON.stringify(originals));
  } catch {
    // storage unavailable - "reset to original" just won't survive a restart
  }
}

/**
 * Record where a song started, once.
 *
 * Only the first sighting counts, which is the whole point: if this were updated
 * on every read then transposing a song would immediately redefine its original
 * key as wherever it now is, and the reset button would become a no-op that
 * looks like it works.
 */
function rememberOriginal(showId: string, key: DetectedKey | null) {
  if (!key) return;
  const originals = loadOriginals();
  if (originals[showId]) return;
  originals[showId] = { pitch: key.pitch, minor: key.minor };
  saveOriginals(originals);
}

export function forgetOriginal(showId: string) {
  const originals = loadOriginals();
  delete originals[showId];
  saveOriginals(originals);
}

// ── Reading the current song ──────────────────────────────────────────────────

/**
 * The show the module is pointed at.
 *
 * Held separately from whatever is on output because they part company all the
 * time: between songs, during the sermon, and any time scripture is up, output
 * names no show at all. Dropping the target then would empty the grid at exactly
 * the moment a musician wants to set the key for the song that is coming - so
 * the last real song is kept until a different one replaces it.
 */
let currentShowId = "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pull a show from FreeShow and work out its key.
 *
 * Deliberately a fresh `get_show` rather than a read of the client's show cache.
 * The cache is fed by the stage feed, which sends the slides that are on screen;
 * detecting a key wants the whole song, and after a transpose it wants the
 * version FreeShow has *just written*, not the one it pushed before the edit.
 */
async function loadShow(showId: string): Promise<KeyTarget | null> {
  const show: Show | null = await freeshowClient.request("get_show", {
    id: showId,
  });
  if (!show) return null;

  const key = detectKey(show);
  rememberOriginal(showId, key);

  return {
    showId,
    showName: show.name || "Untitled",
    show,
    key,
    originalKey: loadOriginals()[showId] || null,
  };
}

/**
 * Point the module at a show, unless it is already there.
 *
 * `force` is for after a transpose, when the id has not changed but the contents
 * have.
 */
export async function focusShow(showId: string, force = false) {
  if (!showId || showId === TEMP_SLIDE_ID) return;
  if (showId === currentShowId && !force) return;

  currentShowId = showId;
  const target = await loadShow(showId);

  // A slower reply for a show that has since been replaced must not overwrite
  // the newer one - the operator moved on while this was in flight.
  if (currentShowId !== showId) return;

  state.update((current) => ({
    ...current,
    target,
    error: target ? "" : "FreeShow did not return that show.",
  }));
}

/** re-read the current show, e.g. after someone transposed it in FreeShow itself */
export async function refresh() {
  if (currentShowId) await focusShow(currentShowId, true);
}

// ── Writing ───────────────────────────────────────────────────────────────────

/**
 * Move the current show by a number of semitones.
 *
 * Each step is a separate API call because that is the only shape FreeShow
 * offers, spaced slightly so a six-step move doesn't arrive as a burst the far
 * end may reorder. Afterwards the show is read back and its key re-detected:
 * FreeShow does not reply to these actions, so looking at the result is the only
 * way to know whether the song actually moved, and reporting a key the band
 * isn't playing in is the one failure mode that really matters here.
 */
export async function transposeBy(steps: number) {
  const current = get(state);
  const target = current.target;
  if (!target || current.busy || steps === 0) return;

  const action = steps > 0 ? "transpose_show_up" : "transpose_show_down";
  const count = Math.abs(steps);

  state.update((value) => ({
    ...value,
    busy: true,
    error: "",
    activity: `Transposing ${steps > 0 ? "up" : "down"} ${count} semitone${count === 1 ? "" : "s"}…`,
  }));

  try {
    for (let step = 0; step < count; step++) {
      const result = freeshowClient.command(action, { id: target.showId });
      if (!result.ok) {
        state.update((value) => ({
          ...value,
          busy: false,
          activity: "",
          error: result.error,
        }));
        return;
      }
      if (step < count - 1) await sleep(STEP_DELAY_MS);
    }

    await sleep(SETTLE_MS);
    const updated = await loadShow(target.showId);

    state.update((value) => ({
      ...value,
      target: updated ?? value.target,
      busy: false,
      activity: "",
      error: updated ? "" : "Transposed, but the show could not be read back to confirm it.",
    }));
  } catch (error) {
    state.update((value) => ({
      ...value,
      busy: false,
      activity: "",
      error: String(error),
    }));
  }
}

/**
 * Put the current show into a given key.
 *
 * Needs a detected key to measure from, and says so plainly when it hasn't got
 * one - guessing a starting point and being wrong would transpose the song to
 * somewhere nobody asked for, in front of everybody.
 */
export async function transposeTo(pitch: number) {
  const current = get(state);
  const target = current.target;
  if (!target || current.busy) return;

  if (!target.key) {
    state.update((value) => ({
      ...value,
      error: "This song has no chords to read a key from, so there is nothing to measure against.",
    }));
    return;
  }

  const steps = semitoneDelta(target.key.pitch, pitch);
  if (steps === 0) return;
  await transposeBy(steps);
}

/** put the song back where it started, if we know where that was */
export async function resetToOriginal() {
  const target = get(state).target;
  if (!target?.originalKey) return;
  await transposeTo(target.originalKey.pitch);
}

/**
 * Follow FreeShow's output, so the grid is always pointed at the song on screen.
 *
 * Scripture and other temporary output name no show, and are ignored rather than
 * treated as "no song" - see `focusShow`.
 */
export function followOutput() {
  return freeshowClient.out.subscribe((out) => {
    const showId = out?.out?.slide?.id;
    if (showId && showId !== TEMP_SLIDE_ID) void focusShow(showId);
  });
}
