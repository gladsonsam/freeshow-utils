<script lang="ts">
  /**
   * The connected displays drawn where they actually sit on the desktop, and
   * clickable.
   *
   * A dropdown of "Display 2 · 1920×1080" asks the operator to hold the whole
   * monitor arrangement in their head and guess which line is the TV on the wall.
   * With three screens, two of them the same resolution, that guess is wrong
   * often enough to matter. Drawn to scale in the same layout Windows shows in
   * its own display settings, the answer is just visible: the wide one on the
   * right is the one on the right.
   */
  import {
    displayTags,
    nativeSize,
    scaleNote,
    type Display,
    type DisplayRef,
  } from "./outputWindow";

  let {
    displays,
    selected = null,
    missing = null,
    onchoose,
  }: {
    displays: Display[];
    /** the live display currently chosen, if it is connected */
    selected?: Display | null;
    /** a remembered choice whose display is not here right now */
    missing?: DisplayRef | null;
    onchoose: (display: Display) => void;
  } = $props();

  /** how tall the map is allowed to get, in px; width comes from the CSS box */
  const MAX_HEIGHT = 260;

  /**
   * Physical pixels, so the boxes keep their real relative sizes and positions.
   * Logical coordinates are each divided by their own monitor's scale factor,
   * which pulls a scaled screen out of place and shrinks it against its
   * neighbours - the arrangement stops matching the one on the desk.
   */
  const bounds = $derived.by(() => {
    if (!displays.length) return { x: 0, y: 0, width: 1, height: 1 };
    const left = Math.min(...displays.map((d) => d.physical.x));
    const top = Math.min(...displays.map((d) => d.physical.y));
    const right = Math.max(...displays.map((d) => d.physical.x + d.physical.width));
    const bottom = Math.max(...displays.map((d) => d.physical.y + d.physical.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  });

  /** aspect-ratio box: the height follows from the desktop's own proportions */
  const ratio = $derived(`${bounds.width} / ${bounds.height}`);
  const maxWidth = $derived(Math.round((bounds.width / bounds.height) * MAX_HEIGHT));

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;

  /**
   * The gap between screens is inset out of each box in px rather than taken out
   * of the geometry, so the map keeps drawing true positions - two screens that
   * touch on the desktop still read as touching.
   */
  const GAP = 3;

  const box = (display: Display) => ({
    left: `calc(${percent(display.physical.x - bounds.x, bounds.width)} + ${GAP}px)`,
    top: `calc(${percent(display.physical.y - bounds.y, bounds.height)} + ${GAP}px)`,
    width: `calc(${percent(display.physical.width, bounds.width)} - ${GAP * 2}px)`,
    height: `calc(${percent(display.physical.height, bounds.height)} - ${GAP * 2}px)`,
  });

  /** a box too short for three lines of text gets the number and the name only */
  const compact = (display: Display) =>
    (display.physical.height / bounds.height) * MAX_HEIGHT < 76;
</script>

{#if displays.length}
  <div class="map" style="aspect-ratio: {ratio}; max-width: {maxWidth}px">
    {#each displays as display (display.index)}
      {@const rect = box(display)}
      {@const tags = displayTags(display)}
      <button
        type="button"
        class="screen"
        class:chosen={selected?.index === display.index}
        class:compact={compact(display)}
        style="left: {rect.left}; top: {rect.top}; width: {rect.width}; height: {rect.height}"
        title={`${display.name} — ${nativeSize(display)}`}
        onclick={() => onchoose(display)}
      >
        <span class="ordinal">{display.index + 1}</span>
        <span class="name">{display.name}</span>
        <span class="size">{nativeSize(display)}</span>
        {#if !compact(display) && (tags.length || scaleNote(display))}
          <span class="tags">
            {#each tags as tag}<span class="tag" class:wireless={tag === "wireless"}>{tag}</span
              >{/each}
            {#if scaleNote(display)}<span class="tag muted">{scaleNote(display)}</span>{/if}
          </span>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <p class="none">No displays detected.</p>
{/if}

{#if missing}
  <!-- The remembered display keeps its place in the UI while it is away, so the
       choice reads as "waiting for the TV" rather than as no choice at all. -->
  <div class="absent">
    <span class="absent-dot"></span>
    <span>
      <strong>{missing.name || `Display ${missing.index + 1}`}</strong> is not connected — the
      output moves to it as soon as it is.
    </span>
  </div>
{/if}

<style>
  .map {
    position: relative;
    width: 100%;
    margin: 0 auto;
    background: var(--primary-darkest);
    border-radius: var(--radius);
    padding: 0;
  }

  .screen {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    overflow: hidden;
    padding: var(--space-2);
    background: var(--primary);
    border: 2px solid transparent;
    border-radius: var(--radius);
    color: var(--text);
    cursor: pointer;
    text-align: center;
    transition:
      background var(--transition),
      border-color var(--transition);
  }

  .screen:hover {
    background: var(--primary-lighter);
  }

  .screen:focus-visible {
    outline: none;
    border-color: var(--secondary-hover);
  }

  .screen.chosen {
    border-color: var(--secondary);
    background: var(--secondary-soft);
  }

  .ordinal {
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1;
    color: var(--text-faint);
  }

  .screen.chosen .ordinal {
    color: var(--secondary);
  }

  .name {
    font-size: 0.8rem;
    font-weight: 600;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size {
    font-size: 0.72rem;
    color: var(--text-dim);
  }

  .screen.compact {
    gap: 0;
    padding: var(--space-1);
  }

  .screen.compact .ordinal {
    font-size: 1.1rem;
  }

  .screen.compact .size {
    display: none;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-1);
  }

  .tag {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: var(--radius-pill);
    background: var(--focus);
    color: var(--text-dim);
  }

  .tag.wireless {
    background: var(--secondary-soft);
    color: var(--secondary-hover);
  }

  .tag.muted {
    background: transparent;
    color: var(--text-faint);
  }

  .none {
    margin: 0;
    padding: var(--space-5);
    text-align: center;
    color: var(--text-dim);
    background: var(--primary-darkest);
    border-radius: var(--radius);
  }

  .absent {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background: var(--focus);
    color: var(--text-dim);
    font-size: 0.85rem;
  }

  .absent strong {
    color: var(--text);
    font-weight: 600;
  }

  .absent-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning);
  }
</style>
