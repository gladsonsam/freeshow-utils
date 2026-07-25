import { derived, readable, writable, type Readable } from "svelte/store";
import { freeshowClient, type FreeShowClient } from "./freeshowClient";
import { TEMP_SLIDE_ID } from "./types";
import type {
  Chord,
  Out,
  OutSlideRef,
  Project,
  ProjectItem,
  Scripture,
  Show,
  ShowItem,
  ShowLine,
  ShowSlide,
  SlideMedia,
  SlideView,
  StageData,
  StageLine,
} from "./types";

// ── Pure resolvers ────────────────────────────────────────────────────────────
// Everything here is a plain function of raw FreeShow data, so it can be reasoned
// about (and tested) without a live connection.

/** a slide in playback order, plus the group parent it hangs off (if any) */
export type SlideRef = {
  id: string;
  parentId: string | null;
  /** id into `show.media` of the picture shown with this slide, if any */
  mediaId: string | null;
};

/**
 * Flatten a layout into the order slides actually play in.
 *
 * A layout only stores the *parent* of each group. A group holding several
 * slides keeps the rest in the parent's `children`, and they play immediately
 * after it. FreeShow's `out.slide.index` counts positions in this expanded list,
 * not in the stored layout - so indexing the raw layout array silently reads the
 * wrong slide as soon as any group has more than one.
 *
 * Per-slide media hangs off the layout too, and each child carries its own under
 * `entry.children[childId]` - which is how a PDF import, stored as one parent
 * plus a child per page, gives every page a different picture.
 */
export function layoutRefs(show: Show, layoutId?: string): SlideRef[] {
  const entries = layoutId ? show.layouts?.[layoutId]?.slides : undefined;
  if (!entries) return [];

  const refs: SlideRef[] = [];
  for (const entry of entries) {
    refs.push({ id: entry.id, parentId: null, mediaId: entry.background || null });
    for (const childId of show.slides?.[entry.id]?.children || []) {
      refs.push({
        id: childId,
        parentId: entry.id,
        mediaId: entry.children?.[childId]?.background || null,
      });
    }
  }
  return refs;
}

/** a resolved slide together with its group parent, so children can inherit */
export type ResolvedSlide = {
  slide: ShowSlide;
  parent: ShowSlide | null;
  /** the show it came from, so its `media` map can be looked up */
  show: Show;
  mediaId: string | null;
};

/** does this item have any text at all, once blank spans are ignored? */
function hasText(item: ShowItem): boolean {
  return (item.lines || []).some((line) =>
    (line.text || []).some((span) => (span.value || "").trim().length > 0),
  );
}

/** pull a resolved `{scripture_*}` placeholder off the slide reference */
function dynamicValue(slideRef: OutSlideRef | undefined, key: string): string {
  const value = slideRef?.customDynamicValues?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Resolve a slide FreeShow built on the fly - which in practice means scripture.
 *
 * There is no show and no layout to index into: the verse on screen arrives
 * whole in `tempItems`, and the verses around it in `previousSlides` /
 * `nextSlides`, nearest first. Looking this up the normal way finds nothing at
 * all, which is why scripture used to leave a template with an empty screen.
 *
 * Neighbours past the ends of the passage come back as empty item shells rather
 * than as nothing, so "has any words" - not "exists" - is what decides whether
 * there is a slide there. Without that, the verse before Genesis 1:1 renders as
 * a blank second block instead of being left out.
 */
export function resolveTempSlide(slideRef: OutSlideRef, offset: number): ResolvedSlide | null {
  const items =
    offset === 0
      ? slideRef.tempItems
      : offset > 0
        ? slideRef.nextSlides?.[offset - 1]
        : slideRef.previousSlides?.[-offset - 1];

  const withText = (items || []).filter(hasText);
  if (!withText.length) return null;

  return {
    // Only the slide actually on screen knows its own reference - FreeShow sends
    // neighbours as bare text - so labelling them too would put the current
    // verse's reference on the wrong verse.
    slide: {
      group: offset === 0 ? dynamicValue(slideRef, "scripture_reference_full") : "",
      items: withText,
    },
    parent: null,
    show: {},
    mediaId: null,
  };
}

/** resolve out.slide (showId + layoutId + index) -> the real slide content */
export function resolveSlide(
  out: Out | null,
  shows: Record<string, Show>,
  offset = 0,
): ResolvedSlide | null {
  const slideRef = out?.out?.slide;
  if (!slideRef?.id) return null;
  if (slideRef.id === TEMP_SLIDE_ID) return resolveTempSlide(slideRef, offset);

  const show = shows[slideRef.id];
  if (!show) return null;

  const refs = layoutRefs(show, slideRef.layout || show.settings?.activeLayout);
  const ref = refs[(slideRef.index ?? 0) + offset];
  if (!ref) return null;

  const slide = show.slides?.[ref.id];
  if (!slide) return null;

  return {
    slide,
    parent: ref.parentId ? (show.slides?.[ref.parentId] ?? null) : null,
    show,
    mediaId: ref.mediaId,
  };
}

/** file extensions FreeShow treats as still images */
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "avif",
  "tif",
  "tiff",
  "svg",
  "heic",
];

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpg", "mpeg"];

/**
 * PDF imports record no `type` on their media, so fall back to the extension.
 * Query strings have to be stripped first - online media arrives as a signed URL
 * with the extension buried before a `?`.
 */
export function mediaType(path: string, declared?: string): string {
  if (declared) return declared;

  const withoutQuery = path.split("?")[0] || "";
  const extension = withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).toLowerCase();

  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  return "";
}

/**
 * Pair a slide's media id with the picture FreeShow has already prepared for it.
 *
 * `src` is passed in rather than read from the show because the show only stores
 * the original path - which for online media is a signed URL that has usually
 * expired by the time anyone presents it. FreeShow sends a usable, downscaled
 * copy on the BACKGROUND channel instead; that is what lands here.
 */
export function toSlideMedia(resolved: ResolvedSlide | null, src: string): SlideMedia | null {
  if (!resolved?.mediaId) return null;

  const ref = resolved.show.media?.[resolved.mediaId];
  if (!ref) return null;

  const path = ref.path || "";
  return { src, type: mediaType(path, ref.type), path, name: ref.name || "" };
}

/**
 * The slide's text boxes, each kept separate. Bilingual shows put one language
 * per item, so collapsing them here would throw away the only thing a template
 * could use to show just one of them.
 */
export function slideTextItems(slide: ShowSlide | null): ShowLine[][] {
  if (!slide?.items) return [];
  return slide.items
    .filter((item) => !item.type || item.type === "text")
    .map((item) => item.lines || []);
}

export function slideTextLines(slide: ShowSlide | null): ShowLine[] {
  return slideTextItems(slide).flat();
}

/** pull a colour out of a FreeShow inline style string */
export function extractColor(style?: string): string | null {
  const match = style?.match(/color:\s*([^;]+);?/);
  const value = match?.[1]?.trim();
  return value && value.length ? value : null;
}

/**
 * Flatten a FreeShow line into the template-facing shape.
 *
 * Chord positions are recorded by FreeShow against the *trimmed* span values, so
 * a chorded line's `text` is built the same way - that keeps `chord.charIndex` a
 * valid index into `text`. Raw (untrimmed) span values are kept separately in
 * `spans` for templates that want FreeShow's inline per-span colouring.
 *
 * That trim is only ever a concession to the chord coordinate space, and it
 * costs real spacing: FreeShow separates a verse number from its verse, and one
 * verse from the next, with whitespace that lives at the edge of a span, so
 * trimming runs them together as "16For God so loved". A line carrying no chords
 * has no coordinate space to protect, so it keeps its spacing intact - which is
 * every scripture line, and any lyric line nobody has put a chord on.
 */
export function toStageLine(line: ShowLine): StageLine {
  const spans = (line.text || []).map((span) => ({
    text: span.value || "",
    color: extractColor(span.style) || "#ffffff",
  }));

  const text = line.chords?.length
    ? spans.map((span) => span.text.trim()).join("")
    : spans
        .map((span) => span.text)
        .join("")
        .trim();

  const chords: Chord[] = [...(line.chords || [])]
    .sort((a, b) => a.pos - b.pos)
    .map((chord) => ({ label: chord.key, charIndex: chord.pos }));

  return { text, color: spans[0]?.color || "#ffffff", chords, spans };
}

/**
 * Slides after the first in a group carry no group name or colour of their own,
 * so they inherit the parent's - otherwise a continuation slide shows a blank
 * group tab instead of "Chorus".
 */
export function toSlideView(resolved: ResolvedSlide | null, mediaSrc = ""): SlideView | null {
  if (!resolved) return null;
  const { slide, parent } = resolved;
  const items = slideTextItems(slide).map((lines) => ({ lines: lines.map(toStageLine) }));
  return {
    group: slide.group || parent?.group || "",
    color: slide.color || parent?.color || "",
    lines: items.flatMap((item) => item.lines),
    items,
    media: toSlideMedia(resolved, mediaSrc),
  };
}

/** how many translations FreeShow will put on one scripture slide */
const MAX_TRANSLATIONS = 4;

/**
 * The reference around the verse on screen, or null if this isn't scripture.
 *
 * FreeShow has already resolved all of this to fill in the `{scripture_*}`
 * placeholders on the slide, so a template never has to parse a reference back
 * out of the rendered words. Other temporary output (a PDF page, say) carries no
 * such values, which is what tells the two apart.
 */
export function toScripture(out: Out | null): Scripture | null {
  const slideRef = out?.out?.slide;
  if (slideRef?.id !== TEMP_SLIDE_ID) return null;

  const reference = dynamicValue(slideRef, "scripture_reference_full");
  const versionLabel = dynamicValue(slideRef, "scripture_name");
  if (!reference && !versionLabel) return null;

  const versions: string[] = [];
  for (let index = 1; index <= MAX_TRANSLATIONS; index++) {
    const name = dynamicValue(slideRef, `scripture${index}_name`);
    if (name) versions.push(name);
  }

  return {
    reference,
    book: dynamicValue(slideRef, "scripture_book"),
    bookAbbreviation: dynamicValue(slideRef, "scripture_book_abbr"),
    chapter: dynamicValue(slideRef, "scripture_chapter"),
    verses: dynamicValue(slideRef, "scripture_verses"),
    versions,
    versionLabel,
    attribution: slideRef.attributionString || "",
  };
}

/**
 * Find the current show inside whichever project contains it at the exact
 * projectIndex FreeShow reports, then the following entry in that same shows[]
 * array is the real next queued item. This is the one piece the Stage protocol
 * alone can't tell us - it has no concept of projects at all.
 */
export function findNextProjectItem(
  out: Out | null,
  projects: Record<string, Project> | null,
): ProjectItem | null {
  const slideRef = out?.out?.slide;
  if (!slideRef?.id || slideRef.projectIndex === undefined || !projects) return null;

  for (const project of Object.values(projects)) {
    const atIndex = project.shows?.[slideRef.projectIndex];
    if (atIndex?.id === slideRef.id) {
      return project.shows?.[slideRef.projectIndex + 1] || null;
    }
  }
  return null;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ── Live store ────────────────────────────────────────────────────────────────

const tick = readable(Date.now(), (set) => {
  const interval = setInterval(() => set(Date.now()), 1000);
  return () => clearInterval(interval);
});

export const EMPTY_STAGE_DATA: StageData = {
  connected: false,
  current: null,
  next: null,
  showName: "",
  nextItemName: "",
  background: "",
  scripture: null,
  clock: formatClock(0),
  timestamp: 0,
};

/**
 * Derive the clean, template-facing StageData from a client's raw state.
 *
 * Project items sometimes arrive without a name (FreeShow only stores the show
 * id), so missing names are back-filled with a one-off `get_show` lookup and
 * cached.
 */
export function createStageState(client: FreeShowClient): Readable<StageData> {
  const showNames = writable<Record<string, string>>({});

  return derived(
    [
      client.status,
      client.out,
      client.shows,
      client.background,
      client.nextBackground,
      client.projects,
      showNames,
      tick,
    ],
    ([status, out, shows, background, nextBackground, projects, names, timestamp]) => {
      const nextItem = findNextProjectItem(out, projects);

      if (nextItem && !nextItem.name && !nextItem.type && !names[nextItem.id]) {
        client.request("get_show", { id: nextItem.id }).then((show) => {
          if (show?.name) showNames.update((cache) => ({ ...cache, [nextItem.id]: show.name }));
        });
      }

      const showId = out?.out?.slide?.id;
      const scripture = toScripture(out);

      return {
        connected: status === "connected",
        // `background` is the live output, which for a slide that owns media is
        // that media - so it doubles as the current slide's picture. `next` only
        // ever comes from the next slide's own layout entry.
        current: toSlideView(resolveSlide(out, shows, 0), background),
        next: toSlideView(resolveSlide(out, shows, 1), nextBackground),
        // scripture has no show behind it, so the chapter stands in as the thing
        // being presented - leaving the verse itself to `current.group`
        showName: scripture
          ? `${scripture.book} ${scripture.chapter}`.trim() || scripture.reference
          : (showId && shows[showId]?.name) || "",
        nextItemName: nextItem ? nextItem.name || names[nextItem.id] || "" : "",
        background,
        scripture,
        clock: formatClock(timestamp),
        timestamp,
      } satisfies StageData;
    },
    EMPTY_STAGE_DATA,
  );
}

/** live stage data for this window's shared connection */
export const stageData = createStageState(freeshowClient);
