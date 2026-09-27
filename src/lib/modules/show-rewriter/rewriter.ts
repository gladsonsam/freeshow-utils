/**
 * The Show Rewriter: hand a show's words to a language model with an
 * instruction, review what comes back slide by slide, and write it to the show.
 *
 * The model never sees or returns the show's structure, only each slide's text
 * in order. Groups, slide count and order stay ours, which is what lets the
 * write be structure-checked: a reply that merged two slides or dropped one is
 * refused here, before anyone has to spot it on the screen.
 *
 * State lives in stores rather than in the component because a rewrite costs a
 * model call and some reading - switching to another module and back must not
 * throw it away.
 */

import { get, writable, type Readable } from "svelte/store";
import { completeStructured } from "$lib/core/openrouter";
import {
  parseShowText,
  readShowText,
  structureMismatch,
  writeShowText,
  type TextSlide,
} from "$lib/core/showText";

// ── Instructions ──────────────────────────────────────────────────────────────

export type Instruction = { id: string; name: string; text: string };

const INSTRUCTIONS_KEY = "freeshow-utils.show-rewriter.instructions";

const STARTERS: Instruction[] = [
  {
    id: "add-translation",
    name: "Add English translation",
    text:
      "This song pairs lines in its original language with their transliteration into Latin script. " +
      "Add an English translation so that every line becomes three, in this order: original, " +
      "transliteration, English translation. If a slide has all its original lines first and the " +
      "transliteration after them, add the translations as a third block after the transliteration, " +
      "in the same order. Make the translation faithful to the meaning and natural to read. Leave any " +
      "slide that already has a translation as it is.",
  },
  {
    id: "fix-typos",
    name: "Fix spelling and punctuation",
    text:
      "Correct spelling, capitalisation and punctuation mistakes. Do not reword anything, and do not " +
      "change lines that are not in English.",
  },
];

function loadInstructions(): Instruction[] {
  if (typeof localStorage === "undefined") return STARTERS;
  try {
    const saved = JSON.parse(localStorage.getItem(INSTRUCTIONS_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : STARTERS;
  } catch {
    return STARTERS;
  }
}

export const instructions = writable<Instruction[]>(loadInstructions());

instructions.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(INSTRUCTIONS_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - edits just won't survive a restart
  }
});

export function addInstruction(): string {
  const id = crypto.randomUUID();
  instructions.update((list) => [...list, { id, name: "New instruction", text: "" }]);
  return id;
}

export function updateInstruction(id: string, patch: Partial<Omit<Instruction, "id">>) {
  instructions.update((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

export function removeInstruction(id: string) {
  instructions.update((list) => list.filter((item) => item.id !== id));
}

// ── Session ───────────────────────────────────────────────────────────────────

export type RewriteSlide = TextSlide & {
  /** what the model returned for this slide, edited by the operator if they chose to */
  rewritten: string;
};

export type RewriterState = {
  showId: string;
  showName: string;
  /** the show's text as it was when loaded - what "undo" writes back */
  original: string;
  slides: RewriteSlide[];
  /** a model call or a write is in flight */
  busy: boolean;
  activity: string;
  error: string;
  /** the rewrite has been written to FreeShow and not undone since */
  applied: boolean;
};

const EMPTY: RewriterState = {
  showId: "",
  showName: "",
  original: "",
  slides: [],
  busy: false,
  activity: "",
  error: "",
  applied: false,
};

const state = writable<RewriterState>(EMPTY);
export const rewriterState: Readable<RewriterState> = state;

let controller: AbortController | null = null;

export async function loadShow(showId: string, showName: string) {
  if (get(state).busy) return;
  state.set({ ...EMPTY, showId, showName, busy: true, activity: "Reading the show…" });

  const text = await readShowText(showId);
  if (get(state).showId !== showId) return;

  if (text === null) {
    state.update((value) => ({ ...value, busy: false, activity: "", error: "FreeShow did not return that show." }));
    return;
  }

  state.update((value) => ({
    ...value,
    original: text,
    slides: parseShowText(text).map((slide) => ({ ...slide, rewritten: "" })),
    busy: false,
    activity: "",
  }));
}

const SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  required: ["slides"],
  additionalProperties: false,
};

// ── Reply rules ───────────────────────────────────────────────────────────────

/**
 * The system prompt: how the model should treat the song and shape its reply.
 *
 * Editable, because what a good reply looks like depends on the church - how
 * translations are phrased, which script transliteration uses, whether to keep
 * punctuation. `{count}` is replaced with the number of slides. Whatever it
 * says, the reply is still forced into one text per slide and checked against
 * the show before anything is written, so a prompt edit can make the words
 * worse but cannot re-flow a show.
 */
export const DEFAULT_SYSTEM_PROMPT = [
  "You edit the words of songs for FreeShow, the presentation software a church uses to put lyrics on screen.",
  "You are given a song as a numbered list of slides, and an instruction. Return every slide's text, changed only as the instruction asks.",
  "",
  "Rules:",
  "- Return exactly {count} slides, in the same order: one for each slide you were given. Never merge, split, reorder, add or drop slides.",
  "- Return only the slide's text. Do not include the group name or slide number.",
  "- Chords are written inline in square brackets, like [G] or [F#m7]. Keep them exactly where they are on the lines you keep. Do not add chords to lines you add.",
  "- Lines like [#1] or [#2:en] mark separate text boxes. Keep them exactly as they are, on their own line.",
  "- Separate lines with a single newline. Never leave a blank line inside a slide.",
  "- Do not add commentary, headings or notes.",
].join("\n");

const SYSTEM_PROMPT_KEY = "freeshow-utils.show-rewriter.system-prompt";

function loadSystemPrompt(): string {
  if (typeof localStorage === "undefined") return DEFAULT_SYSTEM_PROMPT;
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_SYSTEM_PROMPT;
}

export const systemPrompt = writable<string>(loadSystemPrompt());

systemPrompt.subscribe((value) => {
  if (typeof localStorage === "undefined") return;
  try {
    // the default is not stored, so an improved default reaches everyone who never changed it
    if (value === DEFAULT_SYSTEM_PROMPT) localStorage.removeItem(SYSTEM_PROMPT_KEY);
    else localStorage.setItem(SYSTEM_PROMPT_KEY, value);
  } catch {
    // storage unavailable - edits just won't survive a restart
  }
});

export function resetSystemPrompt() {
  systemPrompt.set(DEFAULT_SYSTEM_PROMPT);
}

function userPrompt(instruction: string, showName: string, slides: TextSlide[]): string {
  const song = slides.map((slide, index) => ({
    slide: index + 1,
    group: slide.group,
    text: slide.text,
  }));
  return `Instruction:\n${instruction.trim()}\n\nSong: ${showName}\n\nSlides:\n${JSON.stringify(song, null, 2)}`;
}

export async function rewrite(instruction: string) {
  const current = get(state);
  if (current.busy || !current.slides.length) return;
  if (!instruction.trim()) {
    state.update((value) => ({ ...value, error: "Write an instruction first." }));
    return;
  }

  controller = new AbortController();
  state.update((value) => ({ ...value, busy: true, error: "", activity: "Waiting for the model…" }));

  const result = await completeStructured<{ slides: { text: string }[] }>({
    name: "rewritten_show",
    schema: SCHEMA,
    system: (get(systemPrompt).trim() || DEFAULT_SYSTEM_PROMPT).replaceAll(
      "{count}",
      String(current.slides.length),
    ),
    user: userPrompt(instruction, current.showName, current.slides),
    signal: controller.signal,
  });
  controller = null;

  // the operator loaded another show while this was running
  if (get(state).showId !== current.showId) return;

  if (!result.ok) {
    state.update((value) => ({ ...value, busy: false, activity: "", error: result.error }));
    return;
  }

  const returned = result.data.slides ?? [];
  if (returned.length !== current.slides.length) {
    state.update((value) => ({
      ...value,
      busy: false,
      activity: "",
      error: `The model returned ${returned.length} slides for a show with ${current.slides.length}, so nothing was used. Try again, or try a stronger model.`,
    }));
    return;
  }

  state.update((value) => ({
    ...value,
    busy: false,
    activity: "",
    slides: value.slides.map((slide, index) => ({ ...slide, rewritten: returned[index].text ?? "" })),
  }));
}

export function cancel() {
  controller?.abort();
}

export function editSlide(index: number, text: string) {
  state.update((value) => ({
    ...value,
    slides: value.slides.map((slide, i) => (i === index ? { ...slide, rewritten: text } : slide)),
  }));
}

/** the rewrite as slides, or the reason it can't be written */
function proposed(value: RewriterState): { slides: TextSlide[]; error: string } {
  const slides = value.slides.map((slide) => ({ group: slide.group, text: slide.rewritten }));
  return { slides, error: structureMismatch(value.slides, slides) };
}

export async function apply() {
  const current = get(state);
  if (current.busy || !current.showId) return;

  const { slides, error } = proposed(current);
  if (error) {
    state.update((value) => ({ ...value, error }));
    return;
  }

  state.update((value) => ({ ...value, busy: true, error: "", activity: "Writing to FreeShow…" }));
  const result = await writeShowText(current.showId, slides);
  state.update((value) => ({
    ...value,
    busy: false,
    activity: "",
    error: result.error,
    applied: result.ok || value.applied,
  }));
}

/** put back the text the show had when it was loaded */
export async function undo() {
  const current = get(state);
  if (current.busy || !current.applied) return;

  state.update((value) => ({ ...value, busy: true, error: "", activity: "Restoring the original…" }));
  const result = await writeShowText(current.showId, parseShowText(current.original));
  state.update((value) => ({
    ...value,
    busy: false,
    activity: "",
    error: result.error,
    applied: result.ok ? false : value.applied,
  }));
}
