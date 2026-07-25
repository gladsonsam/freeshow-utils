<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    items,
    active,
    onSelect,
    footer,
  }: {
    title: string;
    items: { id: string; name: string; icon: string }[];
    active: string;
    onSelect: (id: string) => void;
    footer?: Snippet;
  } = $props();
</script>

<aside class="sidebar">
  <div class="sidebar-head">
    <span class="app-title">{title}</span>
  </div>

  <nav class="nav">
    {#each items as item}
      <button
        type="button"
        class="nav-item"
        class:active={item.id === active}
        onclick={() => onSelect(item.id)}
      >
        <span class="nav-icon">{item.icon}</span>
        <span class="nav-name">{item.name}</span>
      </button>
    {/each}
  </nav>

  {#if footer}
    <div class="sidebar-foot">{@render footer()}</div>
  {/if}
</aside>

<style>
  .sidebar {
    flex-shrink: 0;
    width: 220px;
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border-right: 1px solid var(--border);
  }

  .sidebar-head {
    padding: var(--space-5) var(--space-4) var(--space-4);
  }

  .app-title {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--space-2);
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    text-align: left;
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background var(--transition),
      color var(--transition);
  }

  .nav-item:hover:not(.active) {
    background: var(--surface-2);
    color: var(--text);
  }

  .nav-item.active {
    background: var(--surface-3);
    color: var(--text);
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .nav-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .sidebar-foot {
    flex-shrink: 0;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }
</style>
