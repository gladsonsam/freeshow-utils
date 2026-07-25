// ── Raw FreeShow shapes ───────────────────────────────────────────────────────
// Only the fields we actually read. These are FreeShow's internal structures and
// are deliberately NOT exposed to templates - see StageData below for that.

export type StageLayout = { id: string; name: string; password: boolean };

export type ChordRef = { pos: number; key: string };
export type TextSpan = { value?: string; style?: string };
export type ShowLine = { text?: TextSpan[]; chords?: ChordRef[] };
export type ShowItem = { type?: string; lines?: ShowLine[] };
export type ShowSlide = {
  group?: string;
  color?: string;
  items?: ShowItem[];
  /** ids of slides that belong to this one's group and follow it in order */
  children?: string[];
};

/** a media file the show references, keyed by id in `Show.media` */
export type MediaRef = { path?: string; name?: string; type?: string };

/**
 * One entry in a layout. The media shown *with* a slide hangs off the layout,
 * not the slide - and slides in a group keep theirs under `children`, keyed by
 * slide id. Both are ids into `Show.media`.
 */
export type LayoutSlide = {
  id: string;
  background?: string;
  children?: Record<string, { background?: string }>;
};

export type Show = {
  name?: string;
  settings?: { activeLayout?: string };
  layouts?: Record<string, { slides?: LayoutSlide[] }>;
  slides?: Record<string, ShowSlide>;
  media?: Record<string, MediaRef>;
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

/**
 * The picture a slide *is*, rather than the backdrop it sits on.
 *
 * PDF and slide-deck imports come through as slides with no text and one image
 * each, so a template that only draws `lines` renders nothing for them. Ordinary
 * lyric slides have no media of their own even when a background loop is
 * playing behind them - that loop is `StageData.background`, never this.
 */
export interface SlideMedia {
  /**
   * ready to drop straight into `img.src`: a data URI for local files, the
   * original URL for online media. Empty when FreeShow can't inline it - it only
   * sends images, so a slide backed by a video has a `path` but no `src`.
   */
  src: string;
  /** "image", "video" or "" if it can't be told from the file */
  type: string;
  /** the original file path or URL, e.g. for a caption or debugging */
  path: string;
  /** FreeShow's name for it, e.g. "Slide 12" */
  name: string;
}

/**
 * One text box on the slide, kept whole.
 *
 * A slide is not one block of words: FreeShow stores each text box as its own
 * item, and bilingual shows use that to hold a language per item - the original
 * in one, the transliteration in another. A stage screen usually has room for
 * only one of them, so templates need to be able to tell them apart. `items` is
 * in FreeShow's stored order, which is the order the lines are written in.
 */
export interface SlideTextItem {
  lines: StageLine[];
}

export interface SlideView {
  /** slide group name, e.g. "Verse 1" */
  group: string;
  /** group accent colour, e.g. "#5825f5" */
  color: string;
  /** every text item's lines, run together - the whole slide as one list */
  lines: StageLine[];
  /** the same lines, still grouped by the text box they came from */
  items: SlideTextItem[];
  /** this slide's own image, or null - see SlideMedia */
  media: SlideMedia | null;
}

export interface StageData {
  connected: boolean;
  current: SlideView | null;
  next: SlideView | null;
  /** name of the show currently playing */
  showName: string;
  /** name of the next item queued in the project (song, section, video, …) */
  nextItemName: string;
  /**
   * the current output background - whatever is behind the slide, whether that
   * is a worship loop or the slide's own image. A data URI (FreeShow downscales
   * it first), an absolute path, or "". For "is this picture the slide itself?"
   * use `current.media` instead.
   */
  background: string;
  /** pre-formatted local time, e.g. "7:04 PM" */
  clock: string;
  /** ms epoch of the last update - format your own clock from this if you like */
  timestamp: number;
}
