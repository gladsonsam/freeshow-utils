<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title = "",
    padded = true,
    scroll = false,
    actions,
    children,
  }: {
    title?: string;
    padded?: boolean;
    scroll?: boolean;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<section class="panel">
  {#if title || actions}
    <header class="panel-head">
      <h2 class="panel-title">{title}</h2>
      {#if actions}
        <div class="panel-actions">{@render actions()}</div>
      {/if}
    </header>
  {/if}
  <div class="panel-body" class:padded class:scroll>
    {@render children?.()}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--primary);
    border: 1px solid var(--line);
    overflow: hidden;
  }

  .panel-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  .panel-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .panel-body.padded {
    padding: var(--space-4);
  }

  .panel-body.scroll {
    overflow-y: auto;
  }
</style>
