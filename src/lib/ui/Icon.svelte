<script lang="ts">
  /**
   * Line icons drawn as SVG rather than picked from a font.
   *
   * Unicode symbols like ✎ and ⛶ look fine on the machine they were written on
   * and turn into tofu boxes on the next one - which font happens to carry a
   * glyph is not something the app gets to decide. These always render.
   */
  export type IconName =
    | "edit"
    | "duplicate"
    | "export"
    | "delete"
    | "fullscreen"
    | "refresh";

  const PATHS: Record<IconName, string[]> = {
    edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
    duplicate: [
      "M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z",
      "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    ],
    export: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
    delete: ["M18 6 6 18", "M6 6l12 12"],
    fullscreen: [
      "M8 3H5a2 2 0 0 0-2 2v3",
      "M21 8V5a2 2 0 0 0-2-2h-3",
      "M16 21h3a2 2 0 0 0 2-2v-3",
      "M3 16v3a2 2 0 0 0 2 2h3",
    ],
    refresh: ["M21 12a9 9 0 1 1-2.64-6.36L21 8", "M21 3v5h-5"],
  };

  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each PATHS[name] as d}
    <path {d} />
  {/each}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
