/**
 * Chord and key arithmetic.
 *
 * Pure functions over chord labels - no connection, no stores - so the awkward
 * parts (enharmonic spelling, slash chords, working out what key a song is in)
 * can be reasoned about on their own.
 *
 * Nothing here rewrites a show. FreeShow owns the actual transposition, through
 * its `transpose_show_up` / `transpose_show_down` actions; what this file is for
 * is working out *how many semitones* to ask for, and showing the operator what
 * the result will look like before they commit to it.
 */

import type { Show, ShowSlide } from "./types";
import { layoutRefs } from "./stageState";

/** semitones in an octave - the modulus for every calculation here */
export const OCTAVE = 12;

/**
 * How each pitch class is named when it is the key of a song.
 *
 * These are the conventional choices rather than a mechanical sharp/flat table:
 * a worship song in the key a semitone above C is written Db, not C#, and the
 * one a tritone up is F#, not Gb. Musicians read these; being consistent with a
 * chord chart matters more than being consistent with an algorithm.
 */
const MAJOR_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

/** the same for minor keys, where the conventional spellings differ (Ebm, not D#m) */
const MINOR_KEY_NAMES = [
  "Cm",
  "C#m",
  "Dm",
  "Ebm",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "Bbm",
  "Bm",
] as const;

/** note spellings used when transposing chords into a sharp key */
const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** and into a flat key */
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NATURAL_PITCH: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** true modulo - JS `%` keeps the sign of the dividend, which breaks every wrap here */
function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/**
 * A note name to its pitch class, or null if it isn't one.
 *
 * Accepts both typed accidentals (`#`, `b`) and the real musical characters
 * (`♯`, `♭`), because chord charts pasted in from elsewhere carry either. Double
 * accidentals are handled by counting rather than by table lookup, so `Fbb` is
 * as valid as `F#`.
 */
export function pitchClass(note: string): number | null {
  const match = note.trim().match(/^([A-Ga-g])([#b♯♭]*)$/);
  if (!match) return null;

  const natural = NATURAL_PITCH[match[1].toUpperCase()];
  if (natural === undefined) return null;

  let offset = 0;
  for (const accidental of match[2]) {
    if (accidental === "#" || accidental === "♯") offset += 1;
    else offset -= 1;
  }
  return mod(natural + offset, OCTAVE);
}

export type ParsedChord = {
  /** the root note as written, e.g. "C#" */
  root: string;
  /** everything after the root and before any slash, e.g. "m7", "sus4", "" */
  quality: string;
  /** the note after the slash, as written, or null */
  bass: string | null;
};

/**
 * Split a chord label into the parts that move when it is transposed.
 *
 * Returns null for anything that isn't a chord - "N.C.", a stray lyric, an
 * annotation someone parked in the chord row. Callers are expected to leave
 * those alone rather than mangle them.
 */
export function parseChord(label: string): ParsedChord | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const [chordPart, ...rest] = trimmed.split("/");
  const match = chordPart.match(/^([A-Ga-g][#b♯♭]*)(.*)$/);
  if (!match) return null;

  const root = match[1];
  if (pitchClass(root) === null) return null;

  // A slash chord's bass must itself be a note. "C/E" transposes; something like
  // "C/riff" is not a chord over a bass note, so it is not treated as one.
  const bassPart = rest.join("/").trim();
  const bass = bassPart && pitchClass(bassPart) !== null ? bassPart : null;

  return {
    root,
    quality: match[2] + (bassPart && !bass ? "/" + bassPart : ""),
    bass,
  };
}

/** does this chord's quality make it a minor chord? "m" yes, "maj7" no */
export function isMinorQuality(quality: string): boolean {
  return /^m(?!aj)/i.test(quality);
}

/** name a pitch class, spelled for a sharp key or a flat one */
export function noteName(pitch: number, flats: boolean): string {
  return (flats ? FLAT_NOTES : SHARP_NOTES)[mod(pitch, OCTAVE)];
}

/**
 * Whether chords in this key should be spelled with flats.
 *
 * Follows the key signature rather than counting accidentals: songs in F, Bb,
 * Eb, Ab and Db are written with flats, and everything else with sharps. Minor
 * keys follow their relative major, which is three semitones up.
 */
export function keyPrefersFlats(pitch: number, minor: boolean): boolean {
  const relativeMajor = minor ? mod(pitch + 3, OCTAVE) : mod(pitch, OCTAVE);
  return [5, 10, 3, 8, 1].includes(relativeMajor);
}

/** the conventional name for a key, e.g. 3 -> "Eb", or "Cm" for the minor of 0 */
export function keyName(pitch: number, minor: boolean): string {
  return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod(pitch, OCTAVE)];
}

/** every key in chromatic order, named for the quality the song is already in */
export function allKeys(minor: boolean): { pitch: number; label: string }[] {
  return Array.from({ length: OCTAVE }, (_, pitch) => ({
    pitch,
    label: keyName(pitch, minor),
  }));
}

/**
 * Move one chord label by a number of semitones.
 *
 * Anything unparseable comes back untouched - a chord row is user-entered text
 * and may hold things that aren't chords. `flats` picks the spelling, and should
 * come from the *target* key: transposing C up two semitones gives D in either
 * spelling, but up one gives C# in D major and Db in Ab major.
 */
export function transposeChord(label: string, semitones: number, flats: boolean): string {
  const parsed = parseChord(label);
  if (!parsed) return label;

  const rootPitch = pitchClass(parsed.root);
  if (rootPitch === null) return label;

  const root = noteName(rootPitch + semitones, flats);
  const bassPitch = parsed.bass === null ? null : pitchClass(parsed.bass);
  const bass = bassPitch === null ? "" : "/" + noteName(bassPitch + semitones, flats);

  return root + parsed.quality + bass;
}

/**
 * The shortest way from one key to another, as a signed number of semitones.
 *
 * Range is -5..+6, so a move is never more than six of FreeShow's one-semitone
 * steps. The tritone is arbitrary either way and resolves upward, which is the
 * friendlier direction for a vocalist.
 */
export function semitoneDelta(from: number, to: number): number {
  const up = mod(to - from, OCTAVE);
  return up > 6 ? up - OCTAVE : up;
}

/** every chord label in a show, in the order the slides actually play */
export function showChords(show: Show): string[] {
  const refs = layoutRefs(show, show.settings?.activeLayout);
  // A show whose active layout is missing would otherwise look chordless, so
  // fall back to whatever slides it has - order matters less than presence here.
  const slides: ShowSlide[] = refs.length
    ? refs.map((ref) => show.slides?.[ref.id]).filter((slide): slide is ShowSlide => !!slide)
    : Object.values(show.slides || {});

  const labels: string[] = [];
  for (const slide of slides) {
    for (const item of slide.items || []) {
      for (const line of item.lines || []) {
        for (const chord of [...(line.chords || [])].sort((a, b) => a.pos - b.pos)) {
          if (chord.key) labels.push(chord.key);
        }
      }
    }
  }
  return labels;
}

export type DetectedKey = {
  pitch: number;
  minor: boolean;
  /** the conventional name, e.g. "G" or "Am" */
  label: string;
  /** where the answer came from, so the UI can be honest about how solid it is */
  source: "metadata" | "chords";
  /**
   * `false` when this is a guess worth double-checking - the song neither starts
   * nor ends on its key chord, which is what a modulation or a song that ends on
   * the IV looks like from here.
   */
  confident: boolean;
};

/**
 * Read the key out of a show's metadata, if someone filled it in.
 *
 * FreeShow's `.show` format has a `key` field in `meta`, but nothing forces it
 * to be filled in, or to still be true after the song has been transposed - so
 * this is only ever a first opinion, never the last word.
 */
function keyFromMetadata(show: Show): DetectedKey | null {
  const raw = (show as { meta?: Record<string, unknown> }).meta?.key;
  if (typeof raw !== "string" || !raw.trim()) return null;

  const parsed = parseChord(raw);
  if (!parsed) return null;

  const pitch = pitchClass(parsed.root);
  if (pitch === null) return null;

  const minor = isMinorQuality(parsed.quality);
  return {
    pitch,
    minor,
    label: keyName(pitch, minor),
    source: "metadata",
    confident: true,
  };
}

/**
 * Name a key the way the song's own chords spell it.
 *
 * FreeShow transposes by respelling mechanically - sharps on the way up, flats
 * on the way down - so a song moved up from D is written D# G# A#, not Eb Ab Bb.
 * Calling that key "Eb" would be textbook-correct and would disagree with every
 * chord on the stage screen. The pitch is what the arithmetic uses; the label is
 * only ever for the musician reading it, so it follows what they can see.
 */
function writtenKeyName(chord: ParsedChord, minor: boolean): string {
  const root = chord.root.replace("♯", "#").replace("♭", "b");
  return root.charAt(0).toUpperCase() + root.slice(1) + (minor ? "m" : "");
}

/**
 * Work out what key a song is in from its chords.
 *
 * The heuristic is the one a musician uses by eye: songs overwhelmingly begin
 * and end on their key chord, so when the first and last chord agree that is the
 * key and there is little room for doubt. When they disagree - a song that ends
 * on the IV, or one that modulates for the last chorus - the most frequently
 * played root is the better bet, but it is a bet, and it is reported as one.
 */
function keyFromChords(show: Show): DetectedKey | null {
  const parsed = showChords(show)
    .map(parseChord)
    .filter((chord): chord is ParsedChord => !!chord);
  if (!parsed.length) return null;

  const pitched = parsed
    .map((chord) => ({ chord, pitch: pitchClass(chord.root) }))
    .filter((entry): entry is { chord: ParsedChord; pitch: number } => entry.pitch !== null);
  if (!pitched.length) return null;

  const first = pitched[0];
  const last = pitched[pitched.length - 1];

  if (first.pitch === last.pitch) {
    const minor = isMinorQuality(first.chord.quality);
    return {
      pitch: first.pitch,
      minor,
      label: writtenKeyName(first.chord, minor),
      source: "chords",
      confident: true,
    };
  }

  const counts = new Map<number, number>();
  for (const entry of pitched) counts.set(entry.pitch, (counts.get(entry.pitch) || 0) + 1);

  let best = first;
  let bestCount = -1;
  for (const entry of pitched) {
    const count = counts.get(entry.pitch) || 0;
    if (count > bestCount) {
      best = entry;
      bestCount = count;
    }
  }

  const minor = isMinorQuality(best.chord.quality);
  return {
    pitch: best.pitch,
    minor,
    label: writtenKeyName(best.chord, minor),
    source: "chords",
    confident: false,
  };
}

/**
 * The key a show is in, or null if there is nothing to go on.
 *
 * Chords win over metadata, deliberately. Transposing a show rewrites its chords
 * but there is no guarantee it rewrites `meta.key` too, so after one transpose
 * the metadata can be stale while the chords are always the truth of what the
 * band will play.
 */
export function detectKey(show: Show | null | undefined): DetectedKey | null {
  if (!show) return null;
  return keyFromChords(show) ?? keyFromMetadata(show);
}
