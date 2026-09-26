/**
 * A show's words as plain text, and putting changed words back.
 *
 * This is FreeShow's own text-editor format, the one `get_plain_text` returns
 * and `set_plain_text` accepts: slides separated by a blank line, a slide's
 * group on its first line in brackets, chords inline as `[G]`, and `[#2]`
 * markers where a slide has more than one textbox. Working in this format rather
 * than on the show JSON keeps every module clear of layouts, slide ids and item
 * styles - FreeShow maps the text back onto the show itself, keeping each
 * slide's styling where the structure still lines up.
 *
 * That last condition is why writes here are structure-checked. FreeShow matches
 * new text to old slides by position within each group; text with a slide added,
 * lost or moved to another group lands on the wrong slides, and a show that is
 * quietly re-flowed is found on Sunday morning, not when it was edited.
 */

import { freeshowClient } from "./freeshowClient";

export type TextSlide = {
  /** the slide's group, e.g. "Verse 1", or null for a slide that continues one */
  group: string | null;
  /** the slide's lines, chords and textbox markers included, never a blank line */
  text: string;
};

/** how long to give FreeShow to finish writing before reading the show back */
const SETTLE_MS = 400;

const TEXTBOX_MARKER = /\[#(\d+)(?::([^\]]+))?\]/;

/**
 * Split plain text into slides.
 *
 * Mirrors FreeShow's own parser (`getSlide` in its formatTextEditor), including
 * its quirk that any bracketed first line is a group - so a slide whose first
 * line is a lone `[G]` really is read by FreeShow as a group called "G", and
 * this reports it the same way rather than disagreeing about the structure.
 */
export function parseShowText(text: string): TextSlide[] {
  return text
    .split("\n\n")
    .filter((block) => block.trim().length)
    .map((block) => {
      const lines = block.split("\n");
      const first = lines[0];
      const bracketEnd = first.indexOf("]");
      if (!TEXTBOX_MARKER.test(first) && first.indexOf("[") === 0 && bracketEnd === first.trim().length - 1) {
        return { group: first.slice(1, bracketEnd), text: lines.slice(1).join("\n") };
      }
      return { group: null, text: block };
    });
}

export function serializeShowText(slides: TextSlide[]): string {
  return slides
    .map((slide) => (slide.group !== null ? `[${slide.group}]\n` : "") + slide.text)
    .join("\n\n");
}

/**
 * Collapse blank lines inside a slide's text.
 *
 * A blank line is a slide break in this format, so one left inside a slide
 * would split it in two and throw every later slide out of position.
 */
export function cleanSlideText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length)
    .join("\n");
}

/** why `next` cannot safely replace `current`, or "" if it can */
export function structureMismatch(current: TextSlide[], next: TextSlide[]): string {
  if (current.length !== next.length) {
    return `The show has ${current.length} slides but the new text has ${next.length}.`;
  }
  for (let i = 0; i < current.length; i++) {
    if (current[i].group !== next[i].group) {
      return `Slide ${i + 1} is "${current[i].group ?? "(no group)"}" in the show but "${next[i].group ?? "(no group)"}" in the new text.`;
    }
    if (!next[i].text.trim()) return `Slide ${i + 1} would be left empty.`;
  }
  return "";
}

/** a show's text, or null if FreeShow did not return it */
export async function readShowText(showId: string): Promise<string | null> {
  const reply: { id: string; value: string } | null = await freeshowClient.request(
    "get_plain_text",
    { id: showId },
  );
  return typeof reply?.value === "string" ? reply.value : null;
}

/**
 * Replace a show's text, then read it back to confirm it landed.
 *
 * The show is re-read immediately before writing, so an edit someone made in
 * FreeShow since `slides` was produced is noticed rather than overwritten by a
 * structure-check against stale text. FreeShow does not reply to the write, so
 * reading the result back is the only way to know it worked.
 */
export async function writeShowText(
  showId: string,
  slides: TextSlide[],
): Promise<{ ok: boolean; error: string }> {
  const currentText = await readShowText(showId);
  if (currentText === null) return { ok: false, error: "FreeShow did not return the show's text." };

  const cleaned = slides.map((slide) => ({ ...slide, text: cleanSlideText(slide.text) }));
  const mismatch = structureMismatch(parseShowText(currentText), cleaned);
  if (mismatch) return { ok: false, error: mismatch };

  const text = serializeShowText(cleaned);
  const sent = freeshowClient.command("set_plain_text", { id: showId, value: text });
  if (!sent.ok) return sent;

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const written = await readShowText(showId);
  if (written === null) {
    return { ok: false, error: "Sent, but the show could not be read back to confirm it." };
  }
  // Whitespace is FreeShow's to normalise; the words are what has to match.
  const squash = (value: string) => value.replace(/\s+/g, "");
  if (squash(written) !== squash(text)) {
    return { ok: false, error: "Sent, but FreeShow's copy of the show does not match what was sent." };
  }
  return { ok: true, error: "" };
}
