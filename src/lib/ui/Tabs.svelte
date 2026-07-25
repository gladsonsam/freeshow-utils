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
    background: var(--primary-darker);
  }

  /* FreeShow's tab strip: flat, with a --secondary edge marking the active tab */
  .tab {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-top: 2px solid transparent;
    border-radius: var(--radius) var(--radius) 0 0;
    color: var(--text-dim);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--transition),
      color var(--transition);
  }

  .tab:hover:not(.active) {
    background: var(--hover);
    color: var(--text);
  }

  .tab.active {
    background: var(--primary);
    border-top-color: var(--secondary);
    color: var(--text);
  }
</style>
