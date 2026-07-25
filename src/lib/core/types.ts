// ── Raw FreeShow shapes ───────────────────────────────────────────────────────
// Only the fields we actually read. These are FreeShow's internal structures and
// are deliberately NOT exposed to templates - see StageData below for that.

export type StageLayout = { id: string; name: string; password: boolean };

export type ChordRef = { pos: number; key: string };
export type TextSpan = { value?: string; style?: string };
export type ShowLine = { text?: TextSpan[]; chords?: ChordRef[] };
export type ShowItem = { type?: string; lines?: ShowLine[] };
export type ShowSlide = { group?: string; color?: string; items?: ShowItem[] };

export type Show = {
  name?: string;
  settings?: { activeLayout?: string };
  layouts?: Record<string, { slides?: { id: string }[] }>;
  slides?: Record<string, ShowSlide>;
};

export type ProjectItem = { id: string; index: number; name?: string; type?: string };
export type Project = { name: string; shows: ProjectItem[] };

/** what FreeShow reports as currently on-screen */
export type OutSlideRef = {
  id?: string;
  layout?: string;
  index?: number;
  projectIndex?: number;
};
export type Out = { out?: { slide?: OutSlideRef } };

// ── Public template-facing contract ───────────────────────────────────────────
// This is the *entire* surface a stage template sees. It stays stable even if
// FreeShow's protocol internals change, so user templates never break on an
// upstream FreeShow update.

/** a chord placed above a character of the line's `text` */
export interface Chord {
  /** e.g. "C#m7", "B/D#" - rendered as-is */
  label: string;
  /** index into `line.text`; may be >= text.length, meaning "after the line" */
  charIndex: number;
}

export interface StageLine {
  /** the line as one string - this is the coordinate space `chords` index into */
  text: string;
  /** the line's dominant text colour, e.g. "#ffffff" */
  color: string;
  chords: Chord[];
  /** per-span breakdown, for templates that want FreeShow's inline colouring */
  spans: { text: string; color: string }[];
}

export interface SlideView {
  /** slide group name, e.g. "Verse 1" */
  group: string;
  /** group accent colour, e.g. "#5825f5" */
  color: string;
  lines: StageLine[];
}

export interface StageData {
  connected: boolean;
  current: SlideView | null;
  next: SlideView | null;
  /** name of the show currently playing */
  showName: string;
  /** name of the next item queued in the project (song, section, video, …) */
  nextItemName: string;
  /** data URI or absolute path of the current output background, or "" */
  background: string;
  /** pre-formatted local time, e.g. "7:04 PM" */
  clock: string;
  /** ms epoch of the last update - format your own clock from this if you like */
  timestamp: number;
}
