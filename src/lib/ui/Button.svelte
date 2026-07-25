<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "secondary",
    size = "md",
    disabled = false,
    title = "",
    type = "button",
    full = false,
    onclick,
    children,
  }: {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    title?: string;
    type?: "button" | "submit";
    full?: boolean;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button {type} {title} {disabled} {onclick} class="btn {variant} {size}" class:full>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: 1px solid transparent;
    border-radius: 0;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--transition),
      border-color var(--transition),
      color var(--transition);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .md {
    padding: var(--space-2) var(--space-4);
  }

  .sm {
    padding: var(--space-1) var(--space-3);
    font-size: 0.85rem;
  }

  .full {
    width: 100%;
  }

  .primary {
    background: var(--secondary);
    color: var(--secondary-text);
  }

  .primary:hover:not(:disabled) {
    background: var(--secondary-hover);
  }

  .secondary {
    background: var(--primary-lighter);
    color: var(--text);
  }

  .secondary:hover:not(:disabled) {
    background: var(--focus);
  }

  .ghost {
    background: transparent;
    color: var(--text-dim);
  }

  .ghost:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .danger {
    background: var(--danger-soft);
    color: var(--text);
  }

  .danger:hover:not(:disabled) {
    background: var(--danger);
    color: var(--text);
  }
</style>
