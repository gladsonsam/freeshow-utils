/**
 * The Key Changer's background half: everything that has to keep working while
 * the window is in the tray or another module is on screen.
 *
 * A Stream Deck press on Sunday morning cannot depend on someone having opened
 * this tab first, so following output, answering the control surface and
 * publishing the current key all live here, started by the shell at launch, and
 * the component is only a view onto the same state.
 */

import { derived } from "svelte/store";
import { keyName, parseChord, pitchClass } from "$lib/core/chords";
import { publishControlState, registerControlModule } from "$lib/core/controlSurface";
import { connectionStatus } from "$lib/core/freeshowClient";
import {
  followOutput,
  keyChangerState,
  refresh,
  resetToOriginal,
  transposeBy,
  transposeTo,
} from "./keyState";

export const MODULE_ID = "key-changer";

/**
 * Turn a key named in a URL into a pitch class.
 *
 * Accepts whatever a Companion button is likely to have been labelled with -
 * "G", "g", "Gm", "F#", "Gb", "Ab" - because the person building that page is
 * doing it once, by hand, months before it matters, and having it silently do
 * nothing is a bad way to find out you typed the wrong thing.
 */
function pitchFromName(name: string): number | null {
  const parsed = parseChord(decodeURIComponent(name));
  return parsed ? pitchClass(parsed.root) : null;
}

async function handleControl(action: { path: string[] }) {
  const [verb, argument] = action.path;

  if (verb === "up") return transposeBy(1);
  if (verb === "down") return transposeBy(-1);
  if (verb === "reset") return resetToOriginal();
  if (verb === "refresh") return refresh();

  if (verb === "key" && argument) {
    const pitch = pitchFromName(argument);
    if (pitch !== null) await transposeTo(pitch);
  }
}

/**
 * What a remote surface can read back.
 *
 * This is what makes a Stream Deck button light up on the right key: Companion
 * polls it into a variable and a feedback compares that to the button's own
 * key. It has to be pushed on every change, including the ones that came from
 * the Stream Deck itself.
 */
const publishedState = derived([keyChangerState, connectionStatus], ([state, status]) => {
  const target = state.target;
  const key = target?.key ?? null;
  return {
    showName: target?.showName ?? "",
    showId: target?.showId ?? "",
    currentKey: key?.label ?? "",
    currentPitch: key?.pitch ?? -1,
    originalKey: target?.originalKey
      ? keyName(target.originalKey.pitch, target.originalKey.minor)
      : "",
    minor: key?.minor ?? false,
    confident: key?.confident ?? false,
    source: key?.source ?? "",
    busy: state.busy,
    connected: status === "connected",
  };
});

export function activate() {
  const unfollow = followOutput();
  const unregister = registerControlModule(MODULE_ID, handleControl);
  const unpublish = publishedState.subscribe((state) => publishControlState(MODULE_ID, state));

  return () => {
    unfollow();
    unregister();
    unpublish();
  };
}
