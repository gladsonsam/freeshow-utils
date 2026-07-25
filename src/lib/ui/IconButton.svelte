<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    disabled = false,
    active = false,
    onclick,
    children,
  }: {
    title: string;
    disabled?: boolean;
    active?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button type="button" {title} aria-label={title} {disabled} {onclick} class="icon-btn" class:active>
  {@render children?.()}
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    cursor: pointer;
    transition:
      background var(--transition),
      color var(--transition);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text);
  }

  .icon-btn.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
