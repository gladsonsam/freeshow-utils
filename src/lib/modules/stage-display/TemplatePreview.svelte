<script lang="ts">
  import type { StageData } from "$lib/core/types";
  import TemplateFrame from "./TemplateFrame.svelte";

  let { html, data }: { html: string; data: StageData } = $props();

  // Render at a fixed stage size and scale the whole frame down, rather than
  // letting the template lay itself out in a tiny box. Templates size themselves
  // in vh/vw, so this keeps a thumbnail a faithful miniature of the real output.
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;

  let width = $state(0);
  let scale = $derived(width > 0 ? width / DESIGN_WIDTH : 0);
</script>

<div class="preview" bind:clientWidth={width}>
  {#if scale > 0}
    <div
      class="stage"
      style="width: {DESIGN_WIDTH}px; height: {DESIGN_HEIGHT}px; transform: scale({scale});"
    >
      <TemplateFrame {html} {data} />
    </div>
  {/if}
</div>

<style>
  .preview {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #000;
    border-bottom: 1px solid var(--line);
    /* a thumbnail, not a control - clicks belong to the card */
    pointer-events: none;
  }

  .stage {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }
</style>
