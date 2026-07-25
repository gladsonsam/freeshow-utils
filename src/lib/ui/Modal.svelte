<script lang="ts">
  import type { Snippet } from "svelte";
  import IconButton from "./IconButton.svelte";

  let {
    open = false,
    title = "",
    width = "440px",
    onClose,
    footer,
    children,
  }: {
    open?: boolean;
    title?: string;
    width?: string;
    onClose?: () => void;
    footer?: Snippet;
    children?: Snippet;
  } = $props();

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose?.();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div class="scrim">
    <!-- a real button so clicking outside to dismiss is keyboard-reachable too -->
    <button type="button" class="scrim-close" aria-label="Close" onclick={() => onClose?.()}></button>
    <div class="modal" style="width: {width}" role="dialog" aria-label={title}>
      <header class="modal-head">
        <h2 class="modal-title">{title}</h2>
        <IconButton title="Close" onclick={() => onClose?.()}>✕</IconButton>
      </header>
      <div class="modal-body">{@render children?.()}</div>
      {#if footer}
        <footer class="modal-foot">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--overlay);
    padding: var(--space-5);
  }

  .scrim-close {
    position: absolute;
    inset: 0;
    background: transparent;
    border: none;
    cursor: default;
  }

  .modal {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--primary);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-panel);
    overflow: hidden;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--line);
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .modal-body {
    padding: var(--space-4);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--line);
  }
</style>
