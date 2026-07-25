<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { stageData } from "$lib/core/stageState";
  import TemplateFrame from "$lib/modules/stage-display/TemplateFrame.svelte";
  import { readTemplate, type Template } from "$lib/modules/stage-display/templates";

  let template = $state<Template | null>(null);
  let errorMessage = $state("");

  // Nothing here may listen for close-requested. Tauri answers a JS listener by
  // vetoing the close and waiting for the frontend to destroy the window itself,
  // so a listener that fails - or lacks the destroy permission - leaves an output
  // window that cannot be shut. The gallery watches for closures instead.
  onMount(async () => {
    const id = new URLSearchParams(location.search).get("template");
    if (!id) {
      errorMessage = "No template was specified for this output window.";
      return;
    }
    try {
      template = await readTemplate(id);
    } catch (error) {
      errorMessage = String(error);
    }
  });

  // the window is borderless, so it needs its own controls
  async function onKeydown(event: KeyboardEvent) {
    const appWindow = getCurrentWindow();
    if (event.key === "Escape") {
      await appWindow.close();
    } else if (event.key === "F11") {
      event.preventDefault();
      await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="output">
  <!-- hover strip for dragging the borderless window onto a stage monitor -->
  <div class="drag-strip" data-tauri-drag-region>
    <span class="drag-hint">{template?.name ?? ""} · drag to move · F11 fullscreen · Esc close</span>
  </div>

  {#if template}
    <TemplateFrame html={template.html} data={$stageData} />
  {:else}
    <div class="notice">{errorMessage || "Loading template…"}</div>
  {/if}
</div>

<style>
  :global(body) {
    background: #000;
  }

  .output {
    position: fixed;
    inset: 0;
    background: #000;
  }

  .drag-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 26px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    opacity: 0;
    transition: opacity var(--transition);
  }

  .drag-strip:hover {
    opacity: 1;
  }

  .drag-hint {
    font-size: 0.7rem;
    color: #9a9db2;
    pointer-events: none;
  }

  .notice {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    color: #6c6f88;
  }
</style>
