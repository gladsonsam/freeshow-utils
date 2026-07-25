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
    border-radius: var(--radius-sm);
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
    background: var(--accent);
    color: #fff;
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .secondary {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--border);
  }

  .secondary:hover:not(:disabled) {
    background: var(--border-strong);
  }

  .ghost {
    background: transparent;
    color: var(--text-dim);
  }

  .ghost:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }

  .danger {
    background: var(--danger-soft);
    color: var(--danger);
    border-color: var(--danger);
  }

  .danger:hover:not(:disabled) {
    background: var(--danger);
    color: #fff;
  }
</style>
