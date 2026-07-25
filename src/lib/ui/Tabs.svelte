<script lang="ts">
  let {
    tabs,
    active,
    onSelect,
  }: {
    tabs: { id: string; label: string }[];
    active: string;
    onSelect: (id: string) => void;
  } = $props();
</script>

<div class="tabs" role="tablist">
  {#each tabs as tab}
    <button
      type="button"
      role="tab"
      aria-selected={tab.id === active}
      class="tab"
      class:active={tab.id === active}
      onclick={() => onSelect(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: var(--space-1);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 3px;
  }

  .tab {
    padding: var(--space-1) var(--space-4);
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--text-dim);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--transition),
      color var(--transition);
  }

  .tab:hover:not(.active) {
    color: var(--text);
  }

  .tab.active {
    background: var(--surface-3);
    color: var(--text);
  }
</style>
