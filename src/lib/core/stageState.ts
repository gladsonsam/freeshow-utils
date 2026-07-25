import { derived, readable, writable, type Readable } from "svelte/store";
import { freeshowClient, type FreeShowClient } from "./freeshowClient";
import type {
  Chord,
  Out,
  Project,
  ProjectItem,
  Show,
  ShowLine,
  ShowSlide,
  SlideView,
  StageData,
  StageLine,
} from "./types";

// ── Pure resolvers ────────────────────────────────────────────────────────────
// Everything here is a plain function of raw FreeShow data, so it can be reasoned
// about (and tested) without a live connection.

/** a slide in playback order, plus the group parent it hangs off (if any) */
export type SlideRef = { id: string; parentId: string | null };

/**
 * Flatten a layout into the order slides actually play in.
 *
 * A layout only stores the *parent* of each group. A group holding several
 * slides keeps the rest in the parent's `children`, and they play immediately
 * after it. FreeShow's `out.slide.index` counts positions in this expanded list,
 * not in the stored layout - so indexing the raw layout array silently reads the
 * wrong slide as soon as any group has more than one.
 */
export function layoutRefs(show: Show, layoutId?: string): SlideRef[] {
  const entries = layoutId ? show.layouts?.[layoutId]?.slides : undefined;
  if (!entries) return [];

  const refs: SlideRef[] = [];
  for (const entry of entries) {
    refs.push({ id: entry.id, parentId: null });
    for (const childId of show.slides?.[entry.id]?.children || []) {
      refs.push({ id: childId, parentId: entry.id });
    }
  }
  return refs;
}

/** a resolved slide together with its group parent, so children can inherit */
export type ResolvedSlide = { slide: ShowSlide; parent: ShowSlide | null };

/** resolve out.slide (showId + layoutId + index) -> the real slide content */
export function resolveSlide(
  out: Out | null,
  shows: Record<string, Show>,
  offset = 0,
): ResolvedSlide | null {
  const slideRef = out?.out?.slide;
  if (!slideRef?.id) return null;

  const show = shows[slideRef.id];
  if (!show) return null;

  const refs = layoutRefs(show, slideRef.layout || show.settings?.activeLayout);
  const ref = refs[(slideRef.index ?? 0) + offset];
  if (!ref) return null;

  const slide = show.slides?.[ref.id];
  if (!slide) return null;

  return { slide, parent: ref.parentId ? (show.slides?.[ref.parentId] ?? null) : null };
}

export function slideTextLines(slide: ShowSlide | null): ShowLine[] {
  if (!slide?.items) return [];
  return slide.items
    .filter((item) => !item.type || item.type === "text")
    .flatMap((item) => item.lines || []);
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
 * `text` is built the same way - that keeps `chord.charIndex` a valid index into
 * `text`. Raw (untrimmed) span values are kept separately in `spans` for
 * templates that want FreeShow's inline per-span colouring.
 */
export function toStageLine(line: ShowLine): StageLine {
  const spans = (line.text || []).map((span) => ({
    text: span.value || "",
    color: extractColor(span.style) || "#ffffff",
  }));

  const text = spans.map((span) => span.text.trim()).join("");

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
export function toSlideView(resolved: ResolvedSlide | null): SlideView | null {
  if (!resolved) return null;
  const { slide, parent } = resolved;
  return {
    group: slide.group || parent?.group || "",
    color: slide.color || parent?.color || "",
    lines: slideTextLines(slide).map(toStageLine),
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
    [client.status, client.out, client.shows, client.background, client.projects, showNames, tick],
    ([status, out, shows, background, projects, names, timestamp]) => {
      const nextItem = findNextProjectItem(out, projects);

      if (nextItem && !nextItem.name && !nextItem.type && !names[nextItem.id]) {
        client.request("get_show", { id: nextItem.id }).then((show) => {
          if (show?.name) showNames.update((cache) => ({ ...cache, [nextItem.id]: show.name }));
        });
      }

      const showId = out?.out?.slide?.id;

      return {
        connected: status === "connected",
        current: toSlideView(resolveSlide(out, shows, 0)),
        next: toSlideView(resolveSlide(out, shows, 1)),
        showName: (showId && shows[showId]?.name) || "",
        nextItemName: nextItem ? nextItem.name || names[nextItem.id] || "" : "",
        background,
        clock: formatClock(timestamp),
        timestamp,
      } satisfies StageData;
    },
    EMPTY_STAGE_DATA,
  );
}

/** live stage data for this window's shared connection */
export const stageData = createStageState(freeshowClient);
